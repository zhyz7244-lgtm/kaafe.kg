import { db } from './db.js';

export const BONUS_PERCENT = 1;

export function bonusFor(total) {
  return Math.floor((total * BONUS_PERCENT) / 100);
}

// Adds (or subtracts) bonus points and records the transaction.
// Balance can't go below zero.
export function addBonus(customerId, amount, { orderId = null, note = '' } = {}) {
  const run = db.transaction(() => {
    const c = db.prepare('SELECT bonus_balance FROM customers WHERE id = ?').get(customerId);
    if (!c) throw new Error('Клиент не найден');
    if (c.bonus_balance + amount < 0) throw new Error('Недостаточно бонусов на балансе');
    db.prepare('UPDATE customers SET bonus_balance = bonus_balance + ? WHERE id = ?').run(amount, customerId);
    db.prepare(
      'INSERT INTO bonus_transactions (customer_id, amount, order_id, note) VALUES (?, ?, ?, ?)',
    ).run(customerId, amount, orderId, note);
  });
  run();
}

// Called when an order becomes "done": credits 1% once per order.
export function awardOrderBonus(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order || !order.customer_id || order.bonus_awarded) return;
  const amount = bonusFor(order.total);
  db.prepare('UPDATE orders SET bonus_awarded = 1 WHERE id = ?').run(orderId);
  if (amount > 0) addBonus(order.customer_id, amount, { orderId, note: `Бонус ${BONUS_PERCENT}% за заказ №${orderId}` });
}
