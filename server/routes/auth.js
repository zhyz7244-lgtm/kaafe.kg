import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { signToken } from '../auth.js';
import { db } from '../db.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Укажите email и пароль' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  res.json({ token: signToken(admin), email: admin.email });
});

authRouter.post('/change-password', (req, res) => {
  const { email, currentPassword, newPassword } = req.body || {};
  if (!email || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Новый пароль должен быть не короче 8 символов' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin || !bcrypt.compareSync(currentPassword, admin.password_hash)) {
    return res.status(401).json({ error: 'Неверный текущий пароль' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hash, admin.id);
  res.json({ ok: true });
});
