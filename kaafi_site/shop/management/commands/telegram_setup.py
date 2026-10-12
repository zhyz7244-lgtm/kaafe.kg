from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from shop.notify import send_text, telegram_call


class Command(BaseCommand):
    help = "Проверяет Telegram-бота, находит chat id и отправляет тестовое сообщение."

    def handle(self, *args, **opts):
        if not settings.TELEGRAM_BOT_TOKEN:
            raise CommandError("Не задан TELEGRAM_BOT_TOKEN (см. .env.example).")
        try:
            me = telegram_call("getMe")
        except Exception as e:
            raise CommandError(f"Токен не подошёл или нет интернета: {e}")
        self.stdout.write(f"Бот найден: @{me['result']['username']}")

        if not settings.TELEGRAM_CHAT_ID:
            updates = telegram_call("getUpdates").get("result", [])
            chats = {}
            for u in updates:
                msg = u.get("message") or u.get("channel_post") or {}
                chat = msg.get("chat")
                if chat:
                    chats[chat["id"]] = chat.get("title") or chat.get("first_name") or ""
            if not chats:
                raise CommandError(
                    "Чатов не найдено. Напишите вашему боту любое сообщение в Telegram "
                    "и запустите команду ещё раз."
                )
            self.stdout.write("Найденные чаты (впишите нужный id в .env как TELEGRAM_CHAT_ID):")
            for cid, name in chats.items():
                self.stdout.write(f"  {cid}  {name}")
            return

        send_text("✅ Kaafi: уведомления о заказах подключены.")
        self.stdout.write(self.style.SUCCESS("Тестовое сообщение отправлено."))
