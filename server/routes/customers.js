import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { Router } from 'express';
import { requireCustomer, signCustomerToken } from '../auth.js';
import { BONUS_PERCENT } from '../bonus.js';
import { db } from '../db.js';

export const customersRouter = Router();

export const normalizePhone = (v) => (typeof v === 'string' ? v.replace(/[^\d]/g, '') : '');

function newCode() {
  for (;;) {
    const code = String(crypto.randomInt(100000, 1000000));
    if (!db.prepare('SELECT 1 FROM customers WHERE code = ?').get(code)) return code;
  }
}

export function publicProfile(c) {
  return { id: c.id, name: c.name, phone: c.phone, code: c.code, bonus_balance: c.bonus_balance, created_at: c.created_at };
}

// Naive in-memory brute-force guard: 8 failed logins per phone / 15 min.
const failures = new Map();
function tooMany(phone) {
  const f = failures.get(phone);
  return f && f.count >= 8 && Date.now() - f.first < 15 * 60 * 1000;
}
function recordFailure(phone) {
  const f = failures.get(phone);
  if (!f || Date.now() - f.first >= 15 * 60 * 1000) failures.set(phone, { count: 1, first: Date.now() });
  else f.count += 1;
}

customersRouter.post('/register', (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 60) : '';
  const phone = normalizePhone(req.body?.phone);
  const password = req.body?.password;
  if (!name) return res.status(400).json({ error: 'Укажите имя' });
  if (phone.length < 9 || phone.length > 15) return res.status(400).json({ error: 'Укажите корректный номер телефона' });
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Пароль — не короче 6 символов' });
  }
  if (db.prepare('SELECT 1 FROM customers WHERE phone = ?').get(phone)) {
    return res.status(409).json({ error: 'Этот номер уже зарегистрирован — войдите' });
  }
  const { lastInsertRowid } = db
    .prepare('INSERT INTO customers (name, phone, password_hash, code) VALUES (?, ?, ?, ?)')
    .run(name, phone, bcrypt.hashSync(password, 10), newCode());
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(lastInsertRowid);
  res.status(201).json({ token: signCustomerToken(customer), profile: publicProfile(customer) });
});

customersRouter.post('/login', (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const password = req.body?.password;
  if (!phone || typeof password !== 'string') return res.status(400).json({ error: 'Укажите телефон и пароль' });
  if (tooMany(phone)) return res.status(429).json({ error: 'Слишком много попыток, попробуйте позже' });
  const customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
  if (!customer || !bcrypt.compareSync(password, customer.password_hash)) {
    recordFailure(phone);
    return res.status(401).json({ error: 'Неверный телефон или пароль' });
  }
  failures.delete(phone);
  res.json({ token: signCustomerToken(customer), profile: publicProfile(customer) });
});

customersRouter.get('/me', requireCustomer, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.customerId);
  if (!customer) return res.status(401).json({ error: 'Аккаунт не найден' });
  const transactions = db
    .prepare('SELECT id, created_at, amount, note FROM bonus_transactions WHERE customer_id = ? ORDER BY id DESC LIMIT 50')
    .all(customer.id);
  const orders = db
    .prepare('SELECT id, created_at, total, status, mode FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 20')
    .all(customer.id);
  res.json({ profile: publicProfile(customer), transactions, orders, bonusPercent: BONUS_PERCENT });
});
