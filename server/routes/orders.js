import { Router } from 'express';
import { optionalCustomer } from '../auth.js';
import { bonusFor } from '../bonus.js';
import { db } from '../db.js';
import { notify, orderText } from '../notify.js';

export const ordersRouter = Router();

const VALID_MODES = new Set(['delivery', 'dine-in', 'takeaway']);
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Public: a customer places an order from the cart.
ordersRouter.post('/', optionalCustomer, (req, res) => {
  const { mode, lines } = req.body || {};
  const tableNumber = clean(req.body?.tableNumber, 20);
  const phone = clean(req.body?.phone, 30);
  const address = clean(req.body?.address, 200);
  const comment = clean(req.body?.comment, 300);

  if (!VALID_MODES.has(mode)) {
    return res.status(400).json({ error: 'Некорректный способ получения заказа' });
  }
  if (mode === 'dine-in' && !tableNumber) {
    return res.status(400).json({ error: 'Укажите номер стола' });
  }
  if (mode === 'delivery' && (!phone || !address)) {
    return res.status(400).json({ error: 'Для доставки укажите телефон и адрес' });
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'Корзина пуста' });
  }

  const itemIds = lines.map((l) => l.id);
  const placeholders = itemIds.map(() => '?').join(',');
  const menuItems = db
    .prepare(`SELECT * FROM menu_items WHERE id IN (${placeholders})`)
    .all(...itemIds);
  const menuById = new Map(menuItems.map((item) => [item.id, item]));

  const resolvedLines = [];
  for (const line of lines) {
    const item = menuById.get(line.id);
    const qty = Number(line.qty);
    if (!item || !Number.isInteger(qty) || qty <= 0 || qty > 99) {
      return res.status(400).json({ error: 'Некорректная позиция в заказе' });
    }
    resolvedLines.push({ item, qty });
  }

  const customer = req.customerId
    ? db.prepare('SELECT id, name, code FROM customers WHERE id = ?').get(req.customerId)
    : null;
  const customerId = customer ? customer.id : null;

  const total = resolvedLines.reduce((sum, l) => sum + l.item.price * l.qty, 0);

  const createOrder = db.transaction(() => {
    const { lastInsertRowid: orderId } = db
      .prepare(
        'INSERT INTO orders (mode, total, table_number, phone, address, comment, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        mode,
        total,
        mode === 'dine-in' ? tableNumber : null,
        phone || null,
        mode === 'delivery' ? address : null,
        comment || null,
        customerId,
      );
    const insertItem = db.prepare(
      'INSERT INTO order_items (order_id, item_id, name, volume, price, qty) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const { item, qty } of resolvedLines) {
      insertItem.run(orderId, item.id, item.name, item.volume, item.price, qty);
    }
    return orderId;
  });

  const orderId = Number(createOrder());
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  notify(orderText(order, items, customer));

  res.status(201).json({ id: orderId, total, bonus: customer ? bonusFor(total) : 0 });
});
