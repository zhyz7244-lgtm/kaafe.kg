// Order notifications. Configure via environment variables:
//   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (several chats: comma separated)
//   WHATSAPP_PHONE + CALLMEBOT_APIKEY     (free CallMeBot gateway)
// Failures are logged and never break order placement.

async function telegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chats = (process.env.TELEGRAM_CHAT_ID || '').split(',').map((c) => c.trim()).filter(Boolean);
  if (!token || chats.length === 0) return;
  for (const chat_id of chats) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id, text }),
      });
      if (!res.ok) console.error('Telegram error', res.status, await res.text());
    } catch (err) {
      console.error('Telegram notify failed:', err.message);
    }
  }
}

async function whatsapp(text) {
  const phone = process.env.WHATSAPP_PHONE;
  const apikey = process.env.CALLMEBOT_APIKEY;
  if (!phone || !apikey) return;
  try {
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&apikey=${encodeURIComponent(apikey)}&text=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) console.error('WhatsApp error', res.status);
  } catch (err) {
    console.error('WhatsApp notify failed:', err.message);
  }
}

export function notify(text) {
  telegram(text);
  whatsapp(text);
}

const MODE = { delivery: 'Доставка', 'dine-in': 'В зале', takeaway: 'С собой' };

export function orderText(order, items, customer) {
  const head =
    order.mode === 'dine-in'
      ? `🔔 Новый заказ №${order.id} — СТОЛ ${order.table_number}`
      : `🔔 Новый заказ №${order.id} — ${MODE[order.mode]}`;
  const lines = [head, ''];
  for (const i of items) lines.push(`• ${i.name} ${i.volume} × ${i.qty} = ${i.price * i.qty} с`);
  lines.push('', `Итого: ${order.total} с`);
  if (customer) lines.push(`👤 Клиент: ${customer.name} (код ${customer.code})`);
  if (order.phone) lines.push(`📞 ${order.phone}`);
  if (order.address) lines.push(`📍 ${order.address}`);
  if (order.comment) lines.push(`💬 ${order.comment}`);
  return lines.join('\n');
}

export function bookOrderText(o) {
  return [
    `📚 Новый заказ книги №${o.id}`,
    '',
    `${o.title} × ${o.qty} = ${o.total} с`,
    `👤 ${o.name}`,
    `📞 ${o.phone}`,
    `📍 ${o.country}, ${o.city}, ${o.address}`,
  ].join('\n');
}
