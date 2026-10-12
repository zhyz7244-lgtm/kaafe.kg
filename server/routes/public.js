import { Router } from 'express';
import { db } from '../db.js';
import { bookOrderText, notify } from '../notify.js';
import { saveImage } from '../uploads.js';

export const publicRouter = Router();

const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ---- Books ----

publicRouter.get('/books', (_req, res) => {
  res.json(db.prepare('SELECT * FROM books ORDER BY sort_order ASC, id ASC').all());
});

publicRouter.post('/book-orders', (req, res) => {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(Number(req.body?.bookId));
  if (!book || !book.in_stock) return res.status(400).json({ error: 'Книга недоступна' });

  const qty = Number(req.body?.qty);
  const name = clean(req.body?.name, 100);
  const phone = clean(req.body?.phone, 30);
  const country = clean(req.body?.country, 60);
  const city = clean(req.body?.city, 60);
  const address = clean(req.body?.address, 200);
  if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
    return res.status(400).json({ error: 'Некорректное количество' });
  }
  if (!name || !phone || !country || !city || !address) {
    return res.status(400).json({ error: 'Заполните имя, телефон, страну, город и адрес' });
  }

  const total = book.price * qty;
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO book_orders (book_id, title, price, qty, total, name, phone, country, city, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(book.id, book.title, book.price, qty, total, name, phone, country, city, address);
  const order = db.prepare('SELECT * FROM book_orders WHERE id = ?').get(lastInsertRowid);
  notify(bookOrderText(order));
  res.status(201).json({ id: Number(lastInsertRowid), total });
});

// ---- Reviews ----

publicRouter.get('/reviews', (_req, res) => {
  res.json(
    db
      .prepare(
        'SELECT id, created_at, name, rating, text, photo FROM reviews WHERE approved = 1 ORDER BY id DESC',
      )
      .all(),
  );
});

// New reviews wait for admin approval, so strangers can't publish photos
// straight onto the site.
publicRouter.post('/reviews', (req, res) => {
  const name = clean(req.body?.name, 60);
  const text = clean(req.body?.text, 1000);
  const rating = Number(req.body?.rating);
  if (!name) return res.status(400).json({ error: 'Укажите имя' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Поставьте оценку от 1 до 5' });
  }
  if (!text && !req.body?.photoData) {
    return res.status(400).json({ error: 'Напишите отзыв или приложите фото' });
  }
  let photo = null;
  try {
    photo = saveImage(req.body?.photoData);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  db.prepare('INSERT INTO reviews (name, rating, text, photo) VALUES (?, ?, ?, ?)').run(
    name,
    rating,
    text,
    photo,
  );
  notify(`⭐ Новый отзыв (${rating}/5) от ${name} — ждёт модерации в админке.`);
  res.status(201).json({ ok: true });
});
