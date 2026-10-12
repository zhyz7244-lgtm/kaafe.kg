import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { addBonus, awardOrderBonus } from '../bonus.js';
import { db } from '../db.js';
import { publicProfile } from './customers.js';
import { BOOK_CATEGORIES } from '../books-seed.js';
import { deleteImage, saveImage } from '../uploads.js';

export const adminRouter = Router();

const MENU_CATEGORIES = new Set(['hot', 'iced', 'drink', 'mojito', 'food']);
const BOOK_CATEGORY_IDS = new Set(BOOK_CATEGORIES.map((c) => c.id));
const VALID_STATUSES = new Set(['new', 'in_progress', 'done', 'cancelled']);
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Resolves the photo field of a create/update request: a new upload
// (photoData) wins, `photo: null` removes it, otherwise keep the old one.
function resolvePhoto(body, existing) {
  if (body.photoData) {
    const url = saveImage(body.photoData);
    deleteImage(existing);
    return url;
  }
  if (body.photo === null) {
    deleteImage(existing);
    return null;
  }
  return existing ?? null;
}

// ---- Menu management (coffee, drinks, mojito, food) ----

adminRouter.get('/menu', (_req, res) => {
  const items = db.prepare('SELECT * FROM menu_items ORDER BY sort_order ASC').all();
  res.json(items);
});

function validateMenu(body) {
  const name = clean(body.name, 100);
  const volume = clean(body.volume, 30);
  const description = clean(body.description, 500);
  const { price, category } = body;
  if (!name || !Number.isInteger(price) || price <= 0) return { error: 'Заполните название и цену' };
  if (!MENU_CATEGORIES.has(category)) return { error: 'Неизвестная категория' };
  return { value: { name, volume, description, price, category } };
}

adminRouter.post('/menu', (req, res) => {
  const { value, error } = validateMenu(req.body || {});
  if (error) return res.status(400).json({ error });
  let photo;
  try {
    photo = resolvePhoto(req.body, null);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const id = randomUUID();
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS n FROM menu_items').get().n;
  db.prepare(
    'INSERT INTO menu_items (id, name, volume, price, category, sort_order, photo, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, value.name, value.volume, value.price, value.category, maxOrder + 1, photo, value.description);

  res.status(201).json(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id));
});

adminRouter.put('/menu/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Позиция не найдена' });
  const { value, error } = validateMenu(req.body || {});
  if (error) return res.status(400).json({ error });
  let photo;
  try {
    photo = resolvePhoto(req.body, existing.photo);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  db.prepare(
    'UPDATE menu_items SET name = ?, volume = ?, price = ?, category = ?, photo = ?, description = ? WHERE id = ?',
  ).run(value.name, value.volume, value.price, value.category, photo, value.description, req.params.id);
  res.json(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id));
});

adminRouter.delete('/menu/:id', (req, res) => {
  const existing = db.prepare('SELECT photo FROM menu_items WHERE id = ?').get(req.params.id);
  const result = db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Позиция не найдена' });
  deleteImage(existing?.photo);
  res.status(204).end();
});

// ---- Books ----

adminRouter.get('/books', (_req, res) => {
  res.json(db.prepare('SELECT * FROM books ORDER BY sort_order ASC, id ASC').all());
});

function validateBook(body) {
  const title = clean(body.title, 150);
  const author = clean(body.author, 100);
  const description = clean(body.description, 2000);
  const { price } = body;
  if (!title || !Number.isInteger(price) || price <= 0) return { error: 'Заполните название и цену' };
  const in_stock = body.in_stock === false || body.in_stock === 0 ? 0 : 1;
  const category = BOOK_CATEGORY_IDS.has(body.category) ? body.category : '';
  return { value: { title, author, description, price, in_stock, category } };
}

adminRouter.post('/books', (req, res) => {
  const { value, error } = validateBook(req.body || {});
  if (error) return res.status(400).json({ error });
  let photo;
  try {
    photo = resolvePhoto(req.body, null);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS n FROM books').get().n;
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO books (title, author, description, price, photo, in_stock, category, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(value.title, value.author, value.description, value.price, photo, value.in_stock, value.category, maxOrder + 1);
  res.status(201).json(db.prepare('SELECT * FROM books WHERE id = ?').get(lastInsertRowid));
});

adminRouter.put('/books/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Книга не найдена' });
  const { value, error } = validateBook(req.body || {});
  if (error) return res.status(400).json({ error });
  let photo;
  try {
    photo = resolvePhoto(req.body, existing.photo);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  db.prepare(
    'UPDATE books SET title = ?, author = ?, description = ?, price = ?, photo = ?, in_stock = ?, category = ? WHERE id = ?',
  ).run(value.title, value.author, value.description, value.price, photo, value.in_stock, value.category, req.params.id);
  res.json(db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id));
});

// Quick edits from the list on a phone: any subset of price / in_stock / photo.
adminRouter.patch('/books/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Книга не найдена' });
  const body = req.body || {};
  const price = body.price === undefined ? existing.price : body.price;
  if (!Number.isInteger(price) || price <= 0) return res.status(400).json({ error: 'Цена — целое число больше нуля' });
  const in_stock = body.in_stock === undefined ? existing.in_stock : body.in_stock ? 1 : 0;
  let photo;
  try {
    photo = resolvePhoto(body, existing.photo);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  db.prepare('UPDATE books SET price = ?, in_stock = ?, photo = ? WHERE id = ?').run(
    price,
    in_stock,
    photo,
    req.params.id,
  );
  res.json(db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id));
});

adminRouter.delete('/books/:id', (req, res) => {
  const existing = db.prepare('SELECT photo FROM books WHERE id = ?').get(req.params.id);
  const result = db.prepare('DELETE FROM books WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Книга не найдена' });
  deleteImage(existing?.photo);
  res.status(204).end();
});

adminRouter.get('/book-orders', (_req, res) => {
  res.json(db.prepare('SELECT * FROM book_orders ORDER BY id DESC').all());
});

adminRouter.patch('/book-orders/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUSES.has(status)) return res.status(400).json({ error: 'Некорректный статус' });
  const result = db.prepare('UPDATE book_orders SET status = ? WHERE id = ?').run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Заказ не найден' });
  res.json({ ok: true });
});

// ---- Reviews moderation ----

adminRouter.get('/reviews', (_req, res) => {
  res.json(db.prepare('SELECT * FROM reviews ORDER BY id DESC').all());
});

adminRouter.patch('/reviews/:id', (req, res) => {
  const approved = req.body?.approved ? 1 : 0;
  const result = db.prepare('UPDATE reviews SET approved = ? WHERE id = ?').run(approved, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Отзыв не найден' });
  res.json({ ok: true });
});

adminRouter.delete('/reviews/:id', (req, res) => {
  const existing = db.prepare('SELECT photo FROM reviews WHERE id = ?').get(req.params.id);
  const result = db.prepare('DELETE FROM reviews WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Отзыв не найден' });
  deleteImage(existing?.photo);
  res.status(204).end();
});

// ---- Badges / polling (new orders waiting, reviews to moderate) ----

adminRouter.get('/counts', (_req, res) => {
  const n = (sql) => db.prepare(sql).get().n;
  res.json({
    orders: n("SELECT COUNT(*) AS n FROM orders WHERE status = 'new'"),
    bookOrders: n("SELECT COUNT(*) AS n FROM book_orders WHERE status = 'new'"),
    reviews: n('SELECT COUNT(*) AS n FROM reviews WHERE approved = 0'),
    lastOrderId: n('SELECT COALESCE(MAX(id), 0) AS n FROM orders'),
    lastBookOrderId: n('SELECT COALESCE(MAX(id), 0) AS n FROM book_orders'),
  });
});

// ---- Statistics ----
// Cancelled orders are excluded. Dates are shifted to Bishkek time (UTC+6).

const LOCAL = "datetime(created_at, '+6 hours')";
const pad = (n) => String(n).padStart(2, '0');
const EMPTY = { cafeOrders: 0, cafeRevenue: 0, bookOrders: 0, bookRevenue: 0 };
const withTotals = (m) => ({
  ...m,
  orders: m.cafeOrders + m.bookOrders,
  revenue: m.cafeRevenue + m.bookRevenue,
});

adminRouter.get('/stats', (req, res) => {
  const now = new Date(Date.now() + 6 * 3600 * 1000);
  const curYear = now.getUTCFullYear();
  const curMonth = now.getUTCMonth() + 1;
  const year = Number(req.query.year) || curYear;

  // 'YYYY-MM' -> { cafeOrders, cafeRevenue, bookOrders, bookRevenue }
  const byMonth = new Map();
  const collect = (table, kind) => {
    const rows = db
      .prepare(
        `SELECT strftime('%Y-%m', ${LOCAL}) AS ym, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
         FROM ${table} WHERE status != 'cancelled' GROUP BY ym`,
      )
      .all();
    for (const r of rows) {
      const m = byMonth.get(r.ym) || { ...EMPTY };
      m[`${kind}Orders`] = r.orders;
      m[`${kind}Revenue`] = r.revenue;
      byMonth.set(r.ym, m);
    }
  };
  collect('orders', 'cafe');
  collect('book_orders', 'book');

  const sumYear = (y) => {
    const acc = { ...EMPTY };
    for (const [k, m] of byMonth) {
      if (!k.startsWith(`${y}-`)) continue;
      for (const f of Object.keys(acc)) acc[f] += m[f];
    }
    return acc;
  };

  const prevMonthDate = new Date(Date.UTC(curYear, curMonth - 2, 1));
  const monthKey = (y, m) => `${y}-${pad(m)}`;
  const curMonthKey = monthKey(curYear, curMonth);
  const prevMonthKey = monthKey(prevMonthDate.getUTCFullYear(), prevMonthDate.getUTCMonth() + 1);

  const months = Array.from({ length: 12 }, (_, i) =>
    withTotals(byMonth.get(monthKey(year, i + 1)) || EMPTY),
  );
  const yearSet = new Set([String(curYear), ...[...byMonth.keys()].map((k) => k.slice(0, 4))]);
  const years = [...yearSet].sort().map((y) => ({ year: Number(y), ...withTotals(sumYear(y)) }));

  const today = now.toISOString().slice(0, 10);
  const todayOf = (table) =>
    db
      .prepare(
        `SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue FROM ${table}
         WHERE status != 'cancelled' AND date(${LOCAL}) = ?`,
      )
      .get(today);
  const t1 = todayOf('orders');
  const t2 = todayOf('book_orders');

  const topItems = db
    .prepare(
      `SELECT oi.name, SUM(oi.qty) AS qty, SUM(oi.qty * oi.price) AS revenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status != 'cancelled' AND strftime('%Y', datetime(o.created_at, '+6 hours')) = ?
       GROUP BY oi.name ORDER BY qty DESC LIMIT 8`,
    )
    .all(String(year));

  res.json({
    year,
    today: { orders: t1.orders + t2.orders, revenue: t1.revenue + t2.revenue },
    thisMonth: withTotals(byMonth.get(curMonthKey) || EMPTY),
    prevMonth: withTotals(byMonth.get(prevMonthKey) || EMPTY),
    thisYear: { year: curYear, ...withTotals(sumYear(curYear)) },
    prevYear: { year: curYear - 1, ...withTotals(sumYear(curYear - 1)) },
    months,
    years,
    topItems,
  });
});

// ---- Orders ----

adminRouter.get('/orders', (_req, res) => {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC, id DESC').all();
  const itemsStmt = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  const withItems = orders.map((order) => ({
    ...order,
    items: itemsStmt.all(order.id),
  }));
  res.json(withItems);
});

adminRouter.patch('/orders/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUSES.has(status)) {
    return res.status(400).json({ error: 'Некорректный статус' });
  }
  const result = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Заказ не найден' });
  // Loyalty: 1% of a registered customer's order goes to their bonus balance
  // once, when the order is completed.
  if (status === 'done') awardOrderBonus(Number(req.params.id));
  res.json({ ok: true });
});

// ---- Customers & bonuses ----

adminRouter.get('/customers', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const digits = q.replace(/[^\d]/g, '');
  const rows = q
    ? db
        .prepare(
          `SELECT * FROM customers WHERE name LIKE ? OR code = ? OR (? != '' AND phone LIKE ?)
           ORDER BY id DESC LIMIT 100`,
        )
        .all(`%${q}%`, q.replace(/^KAAFI-/i, ''), digits, `%${digits}%`)
    : db.prepare('SELECT * FROM customers ORDER BY id DESC LIMIT 100').all();
  res.json(rows.map(publicProfile));
});

adminRouter.get('/customers/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Клиент не найден' });
  const transactions = db
    .prepare('SELECT id, created_at, amount, note FROM bonus_transactions WHERE customer_id = ? ORDER BY id DESC LIMIT 100')
    .all(c.id);
  const spent = db
    .prepare("SELECT COALESCE(SUM(total), 0) AS n, COUNT(*) AS c FROM orders WHERE customer_id = ? AND status = 'done'")
    .get(c.id);
  res.json({ profile: publicProfile(c), transactions, spent: spent.n, ordersDone: spent.c });
});

// Manual adjustment: positive = give bonus, negative = write off (e.g. the
// customer spends points).
adminRouter.post('/customers/:id/bonus', (req, res) => {
  const amount = Number(req.body?.amount);
  const note = clean(req.body?.note, 200);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 1000000) {
    return res.status(400).json({ error: 'Укажите целое число бонусов (минус — списать)' });
  }
  try {
    addBonus(Number(req.params.id), amount, {
      note: note || (amount > 0 ? 'Начислено администратором' : 'Списано администратором'),
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  res.json(publicProfile(c));
});
