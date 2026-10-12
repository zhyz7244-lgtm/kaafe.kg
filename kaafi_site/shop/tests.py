import io
import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image

from .models import (
    Book, BookCategory, BookOrder, Category, Customer, Order, Product, Review, Table,
)


def png_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), "red").save(buf, "PNG")
    return buf.getvalue()


@override_settings(TELEGRAM_BOT_TOKEN="", TELEGRAM_CHAT_ID="", MEDIA_ROOT="/tmp/kaafi_test_media")
class FlowTests(TestCase):
    def setUp(self):
        cat = Category.objects.create(name="Кофе")
        self.latte = Product.objects.create(category=cat, name="Латте", volume="300 мл", price=200)
        self.table = Table.objects.create(number=5)

    def order(self, client, items, **extra):
        return client.post(
            "/order/",
            json.dumps({"items": items, **extra}),
            content_type="application/json",
        )

    def test_qr_entry_sets_table_and_order_notifies(self):
        self.latte.discount_percent = 10
        self.latte.save()
        r = self.client.get(self.table.get_absolute_url())
        self.assertRedirects(r, "/")
        self.assertContains(self.client.get("/"), "Стол № 5")
        r = self.order(self.client, [{"id": self.latte.pk, "qty": 2}, {"id": self.latte.pk, "qty": 1}])
        self.assertEqual(r.status_code, 200, r.content)
        order = Order.objects.get()
        self.assertEqual(order.table, self.table)
        self.assertEqual(order.total, 180 * 3)  # цена со скидкой считается на сервере

    def test_telegram_really_sends_http_request(self):
        """Поднимаем фейковый Telegram и проверяем реальный HTTP-запрос с заказом."""
        import threading
        from http.server import BaseHTTPRequestHandler, HTTPServer

        got = []

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                body = self.rfile.read(int(self.headers["Content-Length"]))
                got.append((self.path, json.loads(body)))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"ok":true,"result":{"username":"kaafi_bot"}}')

            def log_message(self, *a):
                pass

        srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        try:
            with override_settings(TELEGRAM_API_BASE=f"http://127.0.0.1:{srv.server_port}",
                                   TELEGRAM_BOT_TOKEN="TOKEN", TELEGRAM_CHAT_ID="111, 222"):
                self.client.get(self.table.get_absolute_url())
                with self.captureOnCommitCallbacks(execute=True):
                    r = self.order(self.client, [{"id": self.latte.pk, "qty": 3}], comment="Без сахара")
                self.assertEqual(r.status_code, 200)
                from .notify import notify_new_order
                notify_new_order(Order.objects.get(), wait=True)
        finally:
            srv.shutdown()
        sent = [(p, b) for p, b in got if p.endswith("/sendMessage")]
        self.assertTrue(all(p == "/botTOKEN/sendMessage" for p, _ in sent))
        self.assertEqual({b["chat_id"] for _, b in sent}, {"111", "222"})
        text = sent[0][1]["text"]
        self.assertIn("СТОЛ 5", text)
        self.assertIn("Латте 300 мл × 3 = 600 сом", text)
        self.assertIn("Без сахара", text)

    def test_notify_failure_does_not_break_order(self):
        with override_settings(TELEGRAM_API_BASE="http://127.0.0.1:1", TELEGRAM_BOT_TOKEN="T", TELEGRAM_CHAT_ID="1"):
            self.client.get(self.table.get_absolute_url())
            with self.captureOnCommitCallbacks(execute=True):
                r = self.order(self.client, [{"id": self.latte.pk, "qty": 1}])
            self.assertEqual(r.status_code, 200)
            self.assertEqual(Order.objects.count(), 1)

    def test_placeholder_art_by_drink(self):
        cat = Category.objects.create(name="Холодный кофе")
        iced = Product.objects.create(category=cat, name="Айс Латте", price=220)
        espresso = Product.objects.create(category=self.latte.category, name="Эспрессо", price=100)
        self.assertEqual((iced.art_kind, iced.art_tone), ("iced", "milk"))
        self.assertEqual((espresso.art_kind, espresso.art_tone), ("hot", "dark"))
        html = self.client.get("/").content.decode()
        self.assertIn("tone-dark", html)
        self.assertIn("liq-bot", html)

    def test_cannot_order_without_table_or_unavailable(self):
        self.assertEqual(self.order(self.client, [{"id": self.latte.pk, "qty": 1}]).status_code, 400)
        self.latte.is_available = False
        self.latte.save()
        r = self.order(self.client, [{"id": self.latte.pk, "qty": 1}], table_number=5)
        self.assertEqual(r.status_code, 409)

    def test_cooldown(self):
        self.order(self.client, [{"id": self.latte.pk, "qty": 1}], table_number=5)
        r = self.order(self.client, [{"id": self.latte.pk, "qty": 1}], table_number=5)
        self.assertEqual(r.status_code, 429)

    def test_review_with_photo_needs_moderation(self):
        photo = SimpleUploadedFile("a.png", png_bytes(), content_type="image/png")
        r = self.client.post("/reviews/", {"name": "Айгуль", "rating": 5, "text": "Супер!", "photos": photo})
        self.assertEqual(r.status_code, 302)
        review = Review.objects.get()
        self.assertEqual(review.photos.count(), 1)
        self.assertNotContains(self.client.get("/"), "Супер!")
        review.is_approved = True
        review.save()
        self.assertContains(self.client.get("/"), "Супер!")

    def test_fake_photo_rejected(self):
        bad = SimpleUploadedFile("a.png", b"not an image", content_type="image/png")
        r = self.client.post("/reviews/", {"name": "X", "rating": 5, "text": "hi", "photos": bad})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Review.objects.count(), 0)

    def test_books_pages_set_csrf_cookie(self):
        # Новый гость, который открыл сразу каталог, должен суметь оформить заказ.
        book = Book.objects.create(title="Тест", price=100)
        for url in ("/books/", f"/books/{book.pk}/"):
            self.assertIn("csrftoken", self.client.get(url).cookies, url)

    def test_review_photo_only_is_ok(self):
        photo = SimpleUploadedFile("a.png", png_bytes(), content_type="image/png")
        r = self.client.post("/reviews/", {"name": "Бакыт", "rating": 4, "text": "", "photos": photo})
        self.assertEqual(r.status_code, 302)
        self.assertEqual(Review.objects.get().photos.count(), 1)

    def test_review_needs_text_or_photo(self):
        r = self.client.post("/reviews/", {"name": "Бакыт", "rating": 4, "text": ""})
        self.assertEqual(r.status_code, 400)
        self.assertContains(r, "Напишите отзыв или приложите фото", status_code=400)
        self.assertEqual(Review.objects.count(), 0)

    def test_review_needs_rating(self):
        r = self.client.post("/reviews/", {"name": "Бакыт", "rating": "", "text": "Вкусно"})
        self.assertEqual(r.status_code, 400)
        self.assertEqual(Review.objects.count(), 0)

    def test_staff_pages(self):
        self.assertEqual(self.client.get("/staff/orders/").status_code, 302)
        User = get_user_model()
        User.objects.create_superuser("a", "", "pw")
        self.client.login(username="a", password="pw")
        self.assertEqual(self.client.get("/staff/orders/").status_code, 200)
        self.assertEqual(self.client.get("/staff/orders/feed/").json()["active"], [])
        qr = self.client.get(f"/staff/qr/{self.table.pk}.png")
        self.assertEqual(qr["Content-Type"], "image/png")
        with override_settings(SITE_URL="http://127.0.0.1:8000"):
            self.assertContains(self.client.get("/staff/qr/"), "локальный адрес")
        with override_settings(SITE_URL="https://kaafi.kg"):
            r = self.client.get("/staff/qr/")
            self.assertNotContains(r, "локальный адрес")
            self.assertContains(r, "https://kaafi.kg/t/")
        self.assertEqual(self.client.get("/admin/").status_code, 200)
        for m in ("product", "table", "order", "review", "category"):
            self.assertEqual(self.client.get(f"/admin/shop/{m}/").status_code, 200, m)


@override_settings(TELEGRAM_BOT_TOKEN="", TELEGRAM_CHAT_ID="", WHATSAPP_PHONE="", CALLMEBOT_APIKEY="")
class LoyaltyAndBooksTests(TestCase):
    def setUp(self):
        cat = Category.objects.create(name="Кофе")
        self.latte = Product.objects.create(category=cat, name="Латте", volume="300 мл", price=200)
        self.table = Table.objects.create(number=5)

    def place(self, client, qty=3):
        return client.post(
            "/order/",
            json.dumps({"items": [{"id": self.latte.pk, "qty": qty}]}),
            content_type="application/json",
        )

    def test_guest_can_order_without_registration(self):
        self.client.get(self.table.get_absolute_url())
        r = self.place(self.client)
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(Order.objects.get().customer)
        self.assertEqual(r.json()["bonus"], 0)

    def test_register_login_and_one_percent_bonus_once(self):
        r = self.client.post("/account/register/", {"name": "Айбек", "phone": "+996 555 111 222", "password": "secret1"})
        self.assertRedirects(r, "/account/")
        c = Customer.objects.get()
        self.assertEqual(c.phone, "996555111222")
        self.assertNotEqual(c.password, "secret1")

        self.client.get(self.table.get_absolute_url())
        r = self.place(self.client)  # 3 × 200 = 600 → 6 бонусов
        self.assertEqual(r.json()["bonus"], 6)
        order = Order.objects.get()
        self.assertEqual(order.customer, c)

        order.status = Order.Status.NEW
        order.save()
        c.refresh_from_db()
        self.assertEqual(c.bonus_balance, 0)  # пока не выдан — бонусов нет

        order.status = Order.Status.DONE
        order.save()
        order.save()  # повторное сохранение не должно начислить второй раз
        c.refresh_from_db()
        self.assertEqual(c.bonus_balance, 6)
        self.assertEqual(c.transactions.count(), 1)

    def test_cancelled_order_gives_no_bonus(self):
        c = Customer(name="A", phone="996555000111", code=Customer.new_code())
        c.set_password("secret1")
        c.save()
        o = Order.objects.create(table=self.table, customer=c, total=1000, status=Order.Status.CANCELLED)
        o.save()
        c.refresh_from_db()
        self.assertEqual(c.bonus_balance, 0)

    def test_duplicate_phone_and_wrong_password(self):
        self.client.post("/account/register/", {"name": "A", "phone": "996555111222", "password": "secret1"})
        other = self.client_class()
        r = other.post("/account/register/", {"name": "B", "phone": "+996 (555) 111-222", "password": "secret2"})
        self.assertEqual(r.status_code, 400)
        r = other.post("/account/login/", {"phone": "996555111222", "password": "wrong"})
        self.assertEqual(r.status_code, 400)
        r = other.post("/account/login/", {"phone": "996555111222", "password": "secret1"})
        self.assertRedirects(r, "/account/")

    def test_manual_bonus_cannot_go_negative(self):
        from django.core.exceptions import ValidationError

        c = Customer(name="A", phone="996555000111", code=Customer.new_code())
        c.set_password("secret1")
        c.save()
        c.add_bonus(10, "подарок")
        with self.assertRaises(ValidationError):
            c.add_bonus(-11)
        c.add_bonus(-10)
        self.assertEqual(c.bonus_balance, 0)

    def test_staff_pages_need_login_and_work(self):
        for url in ("/staff/stats/", "/staff/customers/"):
            self.assertEqual(self.client.get(url).status_code, 302)
        admin = get_user_model().objects.create_superuser("root", "r@x.kg", "pw")
        self.client.force_login(admin)
        Order.objects.create(table=self.table, total=500)
        self.assertEqual(self.client.get("/staff/stats/").status_code, 200)
        self.assertEqual(self.client.get("/staff/customers/").status_code, 200)
        c = Customer(name="Мария", phone="996700111222", code="123456")
        c.set_password("secret1")
        c.save()
        found = self.client.get("/staff/customers/lookup/", {"q": "KAAFI-123456"}).json()["results"]
        self.assertEqual(found[0]["name"], "Мария")
        r = self.client.post(f"/staff/customers/{c.pk}/bonus/", {"amount": "25"})
        self.assertEqual(r.json()["customer"]["balance"], 25)
        r = self.client.post(f"/staff/customers/{c.pk}/bonus/", {"amount": "-100"})
        self.assertEqual(r.status_code, 400)


    def test_admin_can_reset_customer_password(self):
        c = Customer(name="Мария", phone="996700111222", code="654321")
        c.set_password("old-password")
        c.save()
        admin = get_user_model().objects.create_superuser("root2", "r2@x.kg", "pw")
        self.client.force_login(admin)
        r = self.client.post(
            "/admin/shop/customer/",
            {"action": "reset_password", "_selected_action": [c.pk]},
            follow=True,
        )
        self.assertContains(r, "временный пароль")
        c.refresh_from_db()
        self.assertFalse(c.check_password("old-password"))


@override_settings(TELEGRAM_BOT_TOKEN="", TELEGRAM_CHAT_ID="", WHATSAPP_PHONE="", CALLMEBOT_APIKEY="")
class GuestStatusAndNotifyTests(TestCase):
    def setUp(self):
        cat = Category.objects.create(name="Кофе")
        self.latte = Product.objects.create(category=cat, name="Латте", volume="300 мл", price=200)
        self.table = Table.objects.create(number=5)

    def test_guest_sees_only_own_order_status(self):
        self.client.get(self.table.get_absolute_url())
        r = self.client.post(
            "/order/", json.dumps({"items": [{"id": self.latte.pk, "qty": 1}]}), content_type="application/json"
        )
        oid = r.json()["order_id"]
        ok = self.client.get(f"/order/{oid}/status/")
        self.assertEqual(ok.json()["status"], "new")
        Order.objects.filter(pk=oid).update(status="in_progress")
        self.assertEqual(self.client.get(f"/order/{oid}/status/").json()["status"], "in_progress")
        stranger = self.client_class()
        self.assertEqual(stranger.get(f"/order/{oid}/status/").status_code, 404)

    def test_art_kinds_for_new_categories(self):
        mint = Product(category=Category(name="Мохито"), name="Мохито классический")
        self.assertEqual((mint.art_kind, mint.art_tone), ("iced", "mint"))
        food = Product(category=Category(name="Еда"), name="Круассан")
        self.assertEqual(food.art_kind, "food")

    def test_notifications_page_permissions_and_save(self):
        import tempfile
        from pathlib import Path

        env = Path(tempfile.mkdtemp()) / "x.env"
        staff = get_user_model().objects.create_user("bar", password="pw", is_staff=True)
        root = get_user_model().objects.create_superuser("owner", "o@x.kg", "pw")
        token = "123456789:AAHabcdefabcdefabcdefabcdefabcdef12"
        with override_settings(ENV_FILE=env):
            self.client.force_login(staff)
            self.assertEqual(self.client.get("/staff/notifications/").status_code, 200)
            r = self.client.post("/staff/notifications/save/", {"token": token, "chat_id": "1"})
            self.assertEqual(r.status_code, 403)  # персонал не меняет настройки

            self.client.force_login(root)
            bad = self.client.post("/staff/notifications/save/", {"token": "nope"})
            self.assertEqual(bad.status_code, 400)
            bad = self.client.post("/staff/notifications/save/", {"chat_id": "abc"})
            self.assertEqual(bad.status_code, 400)
            ok = self.client.post("/staff/notifications/save/", {"token": token, "chat_id": "42,-100"})
            self.assertEqual(ok.status_code, 200)
            text = env.read_text(encoding="utf-8")
            self.assertIn(f"TELEGRAM_BOT_TOKEN={token}", text)
            self.assertIn("TELEGRAM_CHAT_ID=42,-100", text)
            from django.conf import settings

            self.assertEqual(settings.TELEGRAM_CHAT_ID, "42,-100")

    def test_telegram_test_and_find_chat_use_api(self):
        root = get_user_model().objects.create_superuser("owner", "o@x.kg", "pw")
        self.client.force_login(root)
        calls = []

        def fake(method, payload=None):
            calls.append((method, payload))
            if method == "getMe":
                return {"result": {"username": "kaafi_bot"}}
            if method == "getUpdates":
                return {"result": [{"message": {"chat": {"id": 7, "first_name": "Айбек"}}}]}
            return {"ok": True}

        with override_settings(TELEGRAM_BOT_TOKEN="1:x", TELEGRAM_CHAT_ID="7"), mock.patch(
            "shop.notify.telegram_call", fake
        ):
            found = self.client.post("/staff/notifications/find-chat/").json()
            self.assertEqual(found["chats"][0]["id"], 7)
            res = self.client.post("/staff/notifications/test-telegram/")
            self.assertEqual(res.status_code, 200)
            self.assertIn("kaafi_bot", res.json()["message"])
            self.assertIn("sendMessage", [c[0] for c in calls])

    def test_review_notification_text(self):
        from .notify import notify_review

        r = Review.objects.create(name="Мария", rating=4, text="Вкусно")
        with override_settings(TELEGRAM_BOT_TOKEN="1:x", TELEGRAM_CHAT_ID="7"), mock.patch(
            "shop.notify.telegram_call"
        ) as call:
            notify_review(r, wait=True)
            sent = call.call_args[0][1]["text"]
        self.assertIn("Мария", sent)
        self.assertIn("★★★★☆", sent)



@override_settings(TELEGRAM_BOT_TOKEN="", TELEGRAM_CHAT_ID="", WHATSAPP_PHONE="", CALLMEBOT_APIKEY="")
class BookShopTests(TestCase):
    def setUp(self):
        self.classic = BookCategory.objects.create(name="Классика")
        self.self_dev = BookCategory.objects.create(name="Саморазвитие")
        self.b1 = Book.objects.create(title="Маленький принц", author="Экзюпери", price=450, old_price=600,
                                      category=self.classic, sku="B-001")
        self.b2 = Book.objects.create(title="Атомные привычки", author="Джеймс Клир", price=890,
                                      category=self.self_dev, sku="B-002")
        self.gone = Book.objects.create(title="Распроданная", price=100, is_available=False)

    def order(self, items, **extra):
        data = {"items": items, "name": "Иван", "phone": "+996555123456", "delivery_method": "delivery",
                "country": "Кыргызстан", "city": "Бишкек", "address": "ул. Анкара 46", **extra}
        return self.client.post("/books/order/", json.dumps(data), content_type="application/json")

    # ---- каталог ----
    def test_catalog_pages_and_cyrillic_case_insensitive_search(self):
        r = self.client.get("/books/")
        self.assertContains(r, "Маленький принц")
        # регистронезависимый поиск по кириллице (SQLite сам так не умеет)
        for q in ("принц", "ПРИНЦ", "Экзюпери", "b-001", "джеймс клир"):
            r = self.client.get("/books/", {"q": q})
            self.assertEqual(r.context["page"].paginator.count, 1, q)
        self.assertEqual(self.client.get("/books/", {"q": "нет такой"}).context["page"].paginator.count, 0)

    def test_category_filter_sort_and_availability_last(self):
        r = self.client.get("/books/", {"cat": self.classic.pk})
        self.assertEqual([b.title for b in r.context["page"].object_list], ["Маленький принц"])
        r = self.client.get("/books/", {"sort": "price_desc"})
        titles = [b.title for b in r.context["page"].object_list]
        self.assertEqual(titles, ["Атомные привычки", "Маленький принц", "Распроданная"])  # нет в наличии — внизу
        self.assertEqual(self.client.get("/books/", {"sort": "bogus"}).status_code, 200)
        self.assertEqual(self.client.get("/books/", {"cat": "abc"}).status_code, 200)

    def test_pagination(self):
        for i in range(30):
            Book.objects.create(title=f"Книга {i}", price=100 + i)
        r = self.client.get("/books/")
        self.assertEqual(len(r.context["page"].object_list), 24)
        self.assertEqual(r.context["page"].paginator.num_pages, 2)
        self.assertEqual(self.client.get("/books/", {"page": 2}).status_code, 200)
        self.assertEqual(self.client.get("/books/", {"page": 999}).status_code, 200)  # не падает

    def test_detail_page_discount_and_similar(self):
        r = self.client.get(self.b1.get_absolute_url())
        self.assertContains(r, "Маленький принц")
        self.assertEqual(self.b1.discount_percent, 25)
        self.assertEqual(self.client.get("/books/99999/").status_code, 404)

    def test_home_shows_showcase_with_link(self):
        r = self.client.get("/")
        self.assertContains(r, 'href="/books/"')

    # ---- заказ ----
    def test_multi_book_delivery_order_server_prices(self):
        r = self.order([{"id": self.b1.pk, "qty": 2}, {"id": self.b2.pk, "qty": 1, "price": 1}])
        self.assertEqual(r.status_code, 200)
        o = BookOrder.objects.get()
        self.assertEqual(o.total, 450 * 2 + 890)  # цену считает сервер, а не браузер
        self.assertEqual(o.items.count(), 2)
        self.assertEqual(o.delivery_method, "delivery")
        self.assertIn("ул. Анкара 46", o.place)

    def test_pickup_needs_no_address_and_delivery_does(self):
        r = self.order([{"id": self.b1.pk, "qty": 1}], delivery_method="pickup", address="", city="", country="")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(BookOrder.objects.get().place, "Самовывоз из кофейни")
        self.client.session.flush()
        other = self.client_class()
        bad = other.post("/books/order/", json.dumps({
            "items": [{"id": self.b1.pk, "qty": 1}], "name": "И", "phone": "+996555123456",
            "delivery_method": "delivery", "address": ""}), content_type="application/json")
        self.assertEqual(bad.status_code, 400)

    def test_validation_and_unavailable(self):
        self.assertEqual(self.order([]).status_code, 400)
        self.assertEqual(self.order([{"id": self.b1.pk, "qty": 0}]).status_code, 400)
        self.assertEqual(self.order([{"id": self.b1.pk, "qty": 1}], phone="123").status_code, 400)
        self.assertEqual(self.order([{"id": self.b1.pk, "qty": 1}], delivery_method="drone").status_code, 400)
        r = self.order([{"id": self.gone.pk, "qty": 1}])
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["gone"], [self.gone.pk])
        self.assertEqual(BookOrder.objects.count(), 0)

    def test_book_order_gives_no_bonus(self):
        c = Customer(name="A", phone="996555000111", code=Customer.new_code())
        c.set_password("secret1")
        c.save()
        self.client.post("/account/login/", {"phone": "996555000111", "password": "secret1"})
        self.order([{"id": self.b1.pk, "qty": 1}])
        bo = BookOrder.objects.get()
        self.assertEqual(bo.customer, c)
        bo.status = BookOrder.Status.DONE
        bo.save()
        c.refresh_from_db()
        self.assertEqual(c.bonus_balance, 0)  # бонусы — только за кофе

    def test_book_order_notification_text(self):
        from .notify import book_order_text

        self.order([{"id": self.b1.pk, "qty": 2}], comment="Позвоните заранее")
        text = book_order_text(BookOrder.objects.get())
        for part in ("Маленький принц × 2", "900 сом", "Иван", "ул. Анкара 46", "Позвоните заранее", "ДОСТАВКА"):
            self.assertIn(part, text)

    # ---- импорт ----
    def test_csv_import_create_update_and_errors(self):
        from .views import import_books_from_csv

        csv_text = (
            "Название;Автор;Жанр;Цена;Старая цена;Код;В наличии;Описание\n"
            "Новая книга;Автор Н.;Фантастика;500;650;N-1;да;Описание\n"
            "Маленький принц;Экзюпери;Классика;420;;B-001;нет;\n"
            ";Без названия;;100;;;;\n"
            "Без цены;;;;;;;\n"
        )
        created, updated, errors = import_books_from_csv(csv_text.encode("utf-8-sig"))
        self.assertEqual((created, updated, len(errors)), (1, 1, 2))
        new = Book.objects.get(sku="N-1")
        self.assertEqual((new.price, new.old_price, new.category.name), (500, 650, "Фантастика"))
        self.b1.refresh_from_db()
        self.assertEqual((self.b1.price, self.b1.is_available), (420, False))
        self.assertEqual(self.b1.description, "")  # пустая ячейка не затирает уже заполненное поле
        # повторный импорт не плодит дубли
        again = import_books_from_csv(csv_text.encode("utf-8-sig"))
        self.assertEqual((again[0], again[1]), (0, 2))
        self.assertEqual(Book.objects.filter(title="Новая книга").count(), 1)

    def test_csv_import_cp1251_and_comma_delimiter(self):
        from .views import import_books_from_csv

        raw = "Название,Цена\nКнига из Excel,300\n".encode("cp1251")
        self.assertEqual(import_books_from_csv(raw)[0], 1)
        with self.assertRaises(ValueError):
            import_books_from_csv("Автор,Жанр\nА,Б\n".encode("utf-8"))

    def test_bulk_photos_match_by_sku_or_title(self):
        import tempfile

        from .views import attach_book_photos

        with override_settings(MEDIA_ROOT=tempfile.mkdtemp()):
            files = [
                SimpleUploadedFile("B-001.png", png_bytes(), "image/png"),
                SimpleUploadedFile("атомные привычки.png", png_bytes(), "image/png"),
                SimpleUploadedFile("неизвестная.png", png_bytes(), "image/png"),
                SimpleUploadedFile("B-002x.txt", b"not image", "text/plain"),
            ]
            matched, missing, errors = attach_book_photos(files)
        self.assertEqual(matched, 2)
        self.assertEqual(len(missing), 2)
        self.assertTrue(Book.objects.get(sku="B-001").image)
        self.assertTrue(Book.objects.get(sku="B-002").image)

    def test_import_page_requires_staff(self):
        self.assertEqual(self.client.get("/staff/books/import/").status_code, 302)
        admin = get_user_model().objects.create_superuser("owner", "o@x.kg", "pw")
        self.client.force_login(admin)
        self.assertEqual(self.client.get("/staff/books/import/").status_code, 200)
        r = self.client.get("/staff/books/template.csv")
        self.assertEqual(r.status_code, 200)
        self.assertIn("Название", r.content.decode("utf-8-sig"))


@override_settings(TELEGRAM_BOT_TOKEN="", TELEGRAM_CHAT_ID="", WHATSAPP_PHONE="", CALLMEBOT_APIKEY="",
                   SITE_URL="https://kaafi.example")
class CashierAndAccountsTests(TestCase):
    def setUp(self):
        self.root = get_user_model().objects.create_superuser("owner", "o@x.kg", "Pass-12345")
        self.c = Customer(name="Айбек", phone="996555111222", code="123456")
        self.c.set_password("secret1")
        self.c.save()

    def test_qr_is_a_link_to_cashier_and_lookup_understands_it(self):
        self.assertEqual(self.c.qr_url, "https://kaafi.example/staff/customers/?code=123456")
        self.client.force_login(self.root)
        for scanned in (self.c.qr_url, "KAAFI-123456", "123456", "айбек", "555111"):
            res = self.client.get("/staff/customers/lookup/", {"q": scanned}).json()["results"]
            self.assertEqual([r["id"] for r in res], [self.c.pk], scanned)

    def test_quick_one_percent_from_check(self):
        self.client.force_login(self.root)
        r = self.client.post(f"/staff/customers/{self.c.pk}/bonus/", {"check": "540"})
        self.assertEqual(r.json()["customer"]["balance"], 5)
        self.assertIn("1% с чека 540", r.json()["customer"]["history"][0]["note"])
        self.assertEqual(self.client.post(f"/staff/customers/{self.c.pk}/bonus/", {"check": "50"}).status_code, 400)
        self.assertEqual(self.client.post(f"/staff/customers/{self.c.pk}/bonus/", {"check": "abc"}).status_code, 400)

    def test_cashier_registers_guest_with_temp_password_that_guest_can_change(self):
        self.client.force_login(self.root)
        r = self.client.post("/staff/customers/register/", {"name": "Мария", "phone": "+996 700 000 111"})
        self.assertEqual(r.status_code, 201)
        data = r.json()["customer"]
        temp = data["password"]
        self.assertTrue(temp)
        dup = self.client.post("/staff/customers/register/", {"name": "Мария", "phone": "996700000111"})
        self.assertEqual(dup.status_code, 409)
        guest = self.client_class()
        ok = guest.post("/account/login/", {"phone": "996700000111", "password": temp})
        self.assertRedirects(ok, "/account/")
        guest.post("/account/settings/", {"action": "password", "old": temp, "new": "mine-new-pass"})
        self.assertTrue(Customer.objects.get(phone="996700000111").check_password("mine-new-pass"))
        self.assertFalse(Customer.objects.get(phone="996700000111").check_password(temp))

    def test_cashier_register_with_own_password_and_validation(self):
        self.client.force_login(self.root)
        r = self.client.post("/staff/customers/register/", {"name": "Н", "phone": "996700000222", "password": "abc"})
        self.assertEqual(r.status_code, 400)
        r = self.client.post("/staff/customers/register/", {"name": "Н", "phone": "996700000222", "password": "abcdef"})
        self.assertEqual(r.json()["customer"]["password"], "")  # свой пароль обратно не показываем

    def test_customer_profile_settings(self):
        self.client.post("/account/login/", {"phone": "996555111222", "password": "secret1"})
        self.client.post("/account/settings/", {"action": "name", "name": "Айбек Новый"})
        self.c.refresh_from_db()
        self.assertEqual(self.c.name, "Айбек Новый")
        r = self.client.post("/account/settings/", {"action": "password", "old": "WRONG", "new": "another-pass"})
        self.assertIn("error=oldpass", r["Location"])
        r = self.client.post("/account/settings/", {"action": "password", "old": "secret1", "new": "123"})
        self.assertIn("error=newpass", r["Location"])
        self.assertEqual(self.client.get("/account/").status_code, 200)  # остались авторизованы

    def test_staff_changes_own_password_and_stays_logged_in(self):
        self.client.force_login(self.root)
        r = self.client.post("/staff/account/", {"action": "password", "old": "Pass-12345",
                                                  "new": "Brand-new-67890", "new2": "Brand-new-67890"})
        self.assertContains(r, "Пароль изменён")
        self.assertEqual(self.client.get("/staff/account/").status_code, 200)  # сессия не слетела
        self.root.refresh_from_db()
        self.assertTrue(self.root.check_password("Brand-new-67890"))
        bad = self.client.post("/staff/account/", {"action": "password", "old": "nope", "new": "Xx-111222333", "new2": "Xx-111222333"})
        self.assertContains(bad, "неверно")
        weak = self.client.post("/staff/account/", {"action": "password", "old": "Brand-new-67890", "new": "12345678", "new2": "12345678"})
        self.assertContains(weak, "err")

    def test_owner_adds_barista_who_cannot_manage_accounts(self):
        self.client.force_login(self.root)
        r = self.client.post("/staff/account/", {"action": "add_staff", "username": "bar", "password": "Barista-2026-x"})
        self.assertContains(r, "добавлен")
        barista = get_user_model().objects.get(username="bar")
        self.assertTrue(barista.is_staff and not barista.is_superuser)
        b = self.client_class()
        self.assertTrue(b.login(username="bar", password="Barista-2026-x"))
        self.assertEqual(b.get("/staff/orders/").status_code, 200)
        self.assertEqual(b.get("/staff/customers/").status_code, 200)
        r = b.post("/staff/account/", {"action": "add_staff", "username": "evil", "password": "Evil-2026-xx"})
        self.assertContains(r, "только главный администратор")
        self.assertFalse(get_user_model().objects.filter(username="evil").exists())
        # отключение сотрудника
        self.client.post("/staff/account/", {"action": "toggle_staff", "id": barista.pk})
        barista.refresh_from_db()
        self.assertFalse(barista.is_active)

    def test_first_run_setup_only_when_no_admin_and_local(self):
        get_user_model().objects.all().delete()
        local = self.client_class(REMOTE_ADDR="127.0.0.1")
        self.assertContains(local.get("/staff/setup/"), "Создайте свой аккаунт")
        remote = self.client_class(REMOTE_ADDR="8.8.8.8")
        self.assertEqual(remote.get("/staff/setup/").status_code, 403)
        mismatch = local.post("/staff/setup/", {"username": "boss", "password": "Long-pass-2026", "password2": "other"})
        self.assertContains(mismatch, "не совпадают")
        ok = local.post("/staff/setup/", {"username": "boss", "password": "Long-pass-2026", "password2": "Long-pass-2026"})
        self.assertEqual(ok.status_code, 302)
        self.assertTrue(get_user_model().objects.get(username="boss").is_superuser)
        self.assertEqual(local.get("/staff/setup/").status_code, 404)  # второй раз уже нельзя


@override_settings(TELEGRAM_BOT_TOKEN="", TELEGRAM_CHAT_ID="", WHATSAPP_PHONE="", CALLMEBOT_APIKEY="")
class StatsBySectionTests(TestCase):
    def setUp(self):
        from .models import BookOrderItem, OrderItem

        self.coffee = Category.objects.create(name="Кофе", sort_order=0)
        self.food = Category.objects.create(name="Еда", sort_order=1)
        self.latte = Product.objects.create(category=self.coffee, name="Латте", price=200)
        self.cake = Product.objects.create(category=self.food, name="Чизкейк", price=220)
        self.gone = Product.objects.create(category=self.food, name="Снятый с меню", price=50)
        table = Table.objects.create(number=1)

        def order(items, status=Order.Status.DONE):
            o = Order.objects.create(table=table, status=status)
            total = 0
            for prod, price, qty in items:
                OrderItem.objects.create(order=o, product=prod, name=prod.name if prod else "Удалённый", price=price, qty=qty)
                total += price * qty
            Order.objects.filter(pk=o.pk).update(total=total)
            return o

        order([(self.latte, 200, 3), (self.cake, 220, 1)])  # кофе 600, еда 220
        order([(self.latte, 180, 2)])  # кофе 360 (цена со скидкой на момент заказа)
        order([(self.cake, 220, 5)], status=Order.Status.CANCELLED)  # отменён — не считается
        order([(self.gone, 50, 2)])
        self.gone.delete()  # товар удалён из меню — продажа остаётся в «Прочее»

        bo = BookOrder.objects.create(name="И", phone="996555123456", total=1380, delivery_method="pickup")
        book = Book.objects.create(title="Дюна", price=990)
        BookOrderItem.objects.create(order=bo, book=book, title="Дюна", price=990, qty=1)
        BookOrderItem.objects.create(order=bo, book=None, title="Маленький принц", price=390, qty=1)
        self.admin = get_user_model().objects.create_superuser("owner", "o@x.kg", "pw")
        self.client.force_login(self.admin)

    def test_sections_totals_and_cancelled_excluded(self):
        r = self.client.get("/staff/stats/")
        self.assertEqual(r.status_code, 200)
        by = {s["name"]: s for s in r.context["sections"]}
        self.assertEqual((by["Кофе"]["qty"], by["Кофе"]["revenue"]), (5, 960))
        self.assertEqual((by["Еда"]["qty"], by["Еда"]["revenue"]), (1, 220))  # отменённые 5 шт не учтены
        self.assertEqual(by["Прочее"]["revenue"], 100)
        self.assertEqual((by["Книги"]["qty"], by["Книги"]["revenue"]), (2, 1380))
        self.assertTrue(by["Книги"]["is_book"])
        names = [s["name"] for s in r.context["sections"]]
        self.assertEqual(names, ["Кофе", "Еда", "Книги", "Прочее"])  # книги после меню, «Прочее» — последним
        self.assertEqual(sum(s["share"] for s in r.context["sections"]) in range(98, 103), True)

    def test_top_lists(self):
        r = self.client.get("/staff/stats/")
        self.assertEqual(r.context["top_menu"][0]["name"], "Латте")
        self.assertEqual(r.context["top_menu"][0]["section"], "Кофе")
        self.assertEqual([b["name"] for b in r.context["top_books"]], ["Дюна", "Маленький принц"])

    def test_period_totals_and_average_check(self):
        r = self.client.get("/staff/stats/")
        p = r.context["period"]
        self.assertEqual(p["cafe_orders"], 3)
        self.assertEqual(p["cafe_revenue"], 820 + 360 + 100)
        self.assertEqual(p["book_revenue"], 1380)
        self.assertEqual(p["avg_check"], round(1280 / 3))
        self.assertEqual(r.context["best_section"]["name"], "Книги")

    def test_month_filter_and_bad_input(self):
        from django.utils import timezone

        now = timezone.localdate()
        cur = self.client.get("/staff/stats/", {"year": now.year, "month": now.month})
        self.assertEqual(cur.context["period"]["orders"], 4)
        other_month = 1 if now.month != 1 else 2
        empty = self.client.get("/staff/stats/", {"year": now.year, "month": other_month})
        self.assertEqual(empty.context["sections"], [])
        self.assertContains(empty, "продаж пока нет")
        for params in ({"year": "abc"}, {"month": "99"}, {"month": "x"}):
            self.assertEqual(self.client.get("/staff/stats/", params).status_code, 200)
