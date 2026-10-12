import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import jwt from 'jsonwebtoken';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const secretPath = path.join(__dirname, '.jwt-secret');

function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, 'utf8').trim();
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(secretPath, generated);
  return generated;
}

const JWT_SECRET = loadSecret();

export function signToken(admin) {
  return jwt.sign({ sub: admin.id, email: admin.email }, JWT_SECRET, { expiresIn: '7d' });
}

export function signCustomerToken(customer) {
  return jwt.sign({ sub: customer.id, role: 'customer' }, JWT_SECRET, { expiresIn: '90d' });
}

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Admin-only. Customer tokens are signed with the same secret, so they must be
// rejected explicitly.
export function requireAuth(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Требуется авторизация' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role === 'customer') {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Недействительный токен' });
  }
}

export function requireCustomer(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Требуется вход' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'customer') return res.status(403).json({ error: 'Недостаточно прав' });
    req.customerId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Сессия истекла, войдите снова' });
  }
}

// For endpoints open to guests: sets req.customerId when a valid customer
// token is present, otherwise continues as a guest.
export function optionalCustomer(req, _res, next) {
  const token = bearer(req);
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload.role === 'customer') req.customerId = payload.sub;
    } catch {
      // invalid token → treat as guest
    }
  }
  next();
}
