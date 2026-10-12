"""Уведомление администратора о новых заказах: Telegram и/или WhatsApp (CallMeBot)."""

import json
import logging
import threading
import urllib.parse
import urllib.request

from django.conf import settings

log = logging.getLogger(__name__)


def order_text(order):
    lines = [f"🔔 Новый заказ №{order.pk} — СТОЛ {order.table.number}", ""]
    for item in order.items.all():
        lines.append(f"• {item.name} × {item.qty} = {item.subtotal} сом")
    lines.append("")
    lines.append(f"Итого: {order.total} сом")
    if order.customer:
        lines.append(f"👤 Клиент: {order.customer.name} (код {order.customer.qr_text})")
    if order.comment:
        lines.append(f"💬 {order.comment}")
    return "\n".join(lines)


def book_order_text(o):
    lines = [f"📚 Новый заказ книг №{o.pk} — {o.get_delivery_method_display().upper()}", ""]
    for i in o.items.all():
        lines.append(f"• {i.title} × {i.qty} = {i.subtotal} сом")
    lines += ["", f"Итого: {o.total} сом", f"👤 {o.name}", f"📞 {o.phone}", f"📍 {o.place}"]
    if o.comment:
        lines.append(f"💬 {o.comment}")
    return "\n".join(lines)


def telegram_call(method, payload=None):
    """Вызов Telegram Bot API. Возвращает разобранный JSON-ответ."""
    url = f"{settings.TELEGRAM_API_BASE}/bot{settings.TELEGRAM_BOT_TOKEN}/{method}"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload or {}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def _send_telegram(text):
    if not (settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID):
        return
    chats = [c.strip() for c in settings.TELEGRAM_CHAT_ID.split(",") if c.strip()]
    for chat_id in chats:
        try:
            telegram_call("sendMessage", {"chat_id": chat_id, "text": text})
        except Exception:  # уведомление не должно ломать оформление заказа
            log.exception("Не удалось отправить Telegram-уведомление в чат %s", chat_id)


def _send_whatsapp(text):
    """WhatsApp через бесплатный шлюз CallMeBot (нужны WHATSAPP_PHONE и CALLMEBOT_APIKEY)."""
    if not (settings.WHATSAPP_PHONE and settings.CALLMEBOT_APIKEY):
        return
    query = urllib.parse.urlencode(
        {"phone": settings.WHATSAPP_PHONE, "apikey": settings.CALLMEBOT_APIKEY, "text": text}
    )
    try:
        urllib.request.urlopen(f"https://api.callmebot.com/whatsapp.php?{query}", timeout=10).read()
    except Exception:
        log.exception("Не удалось отправить WhatsApp-уведомление")


def send_text(text):
    _send_telegram(text)
    _send_whatsapp(text)


def _configured():
    return bool(
        (settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID)
        or (settings.WHATSAPP_PHONE and settings.CALLMEBOT_APIKEY)
    )


def notify_text(text, wait=False):
    if not _configured():
        return None
    if wait:
        return send_text(text)
    t = threading.Thread(target=send_text, args=(text,), daemon=True)
    t.start()
    return t


def notify_new_order(order, wait=False):
    return notify_text(order_text(order), wait=wait)


def notify_book_order(book_order, wait=False):
    return notify_text(book_order_text(book_order), wait=wait)


def notify_review(review, wait=False):
    stars = "★" * review.rating + "☆" * (5 - review.rating)
    text = f"⭐ Новый отзыв {stars} от {review.name} — ждёт одобрения в админке."
    if review.text:
        text += f"\n\n«{review.text[:300]}»"
    return notify_text(text, wait=wait)


# ---------- проверка подключения (страница «Уведомления») ----------

TEST_TEXT = "✅ Kaafi: уведомления о заказах подключены."


def telegram_status():
    return {
        "token": bool(settings.TELEGRAM_BOT_TOKEN),
        "chat": bool(settings.TELEGRAM_CHAT_ID),
        "token_hint": ("…" + settings.TELEGRAM_BOT_TOKEN[-4:]) if settings.TELEGRAM_BOT_TOKEN else "",
    }


def whatsapp_status():
    return {"phone": bool(settings.WHATSAPP_PHONE), "key": bool(settings.CALLMEBOT_APIKEY)}


def check_telegram():
    """Реально отправляет тестовое сообщение. Возвращает (ok, понятное_сообщение)."""
    if not settings.TELEGRAM_BOT_TOKEN:
        return False, "Не указан токен бота."
    try:
        me = telegram_call("getMe")
    except Exception as e:
        return False, f"Токен не подошёл или нет интернета ({e})."
    name = me.get("result", {}).get("username", "")
    chats = [c.strip() for c in settings.TELEGRAM_CHAT_ID.split(",") if c.strip()]
    if not chats:
        return False, f"Бот @{name} найден, но не указан chat id — нажмите «Найти мой chat id»."
    errors = []
    for chat_id in chats:
        try:
            telegram_call("sendMessage", {"chat_id": chat_id, "text": TEST_TEXT})
        except Exception as e:
            errors.append(f"чат {chat_id}: {e}")
    if errors:
        return False, "Не удалось отправить: " + "; ".join(errors) + ". Напишите боту /start и проверьте chat id."
    return True, f"Тестовое сообщение отправлено через @{name}."


def find_telegram_chats():
    """Чаты, которые писали боту: [(id, название)]. Нужно, чтобы владелец не искал chat id руками."""
    updates = telegram_call("getUpdates").get("result", [])
    chats = {}
    for u in updates:
        msg = u.get("message") or u.get("channel_post") or {}
        chat = msg.get("chat")
        if chat:
            chats[chat["id"]] = chat.get("title") or chat.get("first_name") or str(chat["id"])
    return list(chats.items())


def check_whatsapp():
    if not (settings.WHATSAPP_PHONE and settings.CALLMEBOT_APIKEY):
        return False, "Не указан номер или ключ CallMeBot."
    query = urllib.parse.urlencode(
        {"phone": settings.WHATSAPP_PHONE, "apikey": settings.CALLMEBOT_APIKEY, "text": TEST_TEXT}
    )
    try:
        urllib.request.urlopen(f"https://api.callmebot.com/whatsapp.php?{query}", timeout=15).read()
    except Exception as e:
        return False, f"Не удалось отправить ({e}). Проверьте номер и ключ."
    return True, "Тестовое сообщение отправлено в WhatsApp."


def save_env(updates):
    """Записывает значения в .env рядом с manage.py и применяет их сразу (без перезапуска)."""
    import os

    path = getattr(settings, "ENV_FILE", None) or (settings.BASE_DIR / ".env")
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    seen = set()
    for i, line in enumerate(lines):
        key = line.split("=", 1)[0].strip()
        if "=" in line and not line.lstrip().startswith("#") and key in updates:
            lines[i] = f"{key}={updates[key]}"
            seen.add(key)
    for key, value in updates.items():
        if key not in seen:
            lines.append(f"{key}={value}")
        os.environ[key] = value
        setattr(settings, key, value)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
