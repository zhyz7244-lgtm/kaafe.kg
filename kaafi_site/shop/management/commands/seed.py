from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from shop.models import Category, Product, Table

# Меню из Instagram @kaafi_kg (пост от 19 июня).
MENU = {
    "Кофе": [
        ("Эспрессо", "30 мл", 100),
        ("Американо", "200 мл", 140),
        ("Американо", "300 мл", 160),
        ("Капучино", "200 мл", 150),
        ("Капучино", "300 мл", 180),
        ("Латте", "300 мл", 180),
        ("Флэт Уайт", "200 мл", 180),
        ("Раф Кофе", "300 мл", 220),
    ],
    "Холодный кофе": [
        ("Айс Американо", "500 мл", 170),
        ("Айс Латте", "500 мл", 220),
        ("Айс Капучино", "500 мл", 230),
        ("Айс Раф", "500 мл", 240),
    ],
    # Примерные позиции — поправьте названия, цены и добавьте фото в админке.
    "Напитки": [
        ("Чай чёрный", "400 мл", 90),
        ("Чай зелёный", "400 мл", 90),
        ("Горячий шоколад", "250 мл", 180),
        ("Лимонад домашний", "400 мл", 150),
        ("Свежевыжатый сок", "300 мл", 200),
    ],
    "Мохито": [
        ("Мохито классический", "400 мл", 220),
        ("Мохито клубничный", "400 мл", 240),
        ("Мохито маракуйя", "400 мл", 250),
    ],
    "Еда": [
        ("Круассан", "1 шт", 120),
        ("Сэндвич с курицей", "1 шт", 250),
        ("Чизкейк", "1 порция", 220),
        ("Брауни", "1 шт", 150),
    ],
}


class Command(BaseCommand):
    help = "Заполняет пустую базу: меню, 10 столов и учётную запись администратора."

    def add_arguments(self, parser):
        parser.add_argument("--tables", type=int, default=10, help="Сколько столов создать")

    def handle(self, *args, **opts):
        if not Category.objects.exists():
            for ci, (cat_name, items) in enumerate(MENU.items()):
                cat = Category.objects.create(name=cat_name, sort_order=ci)
                for pi, (name, volume, price) in enumerate(items):
                    Product.objects.create(
                        category=cat, name=name, volume=volume, price=price, sort_order=pi
                    )
            self.stdout.write("Меню создано.")

        if not Table.objects.exists():
            for n in range(1, opts["tables"] + 1):
                Table.objects.create(number=n)
            self.stdout.write(f"Создано столов: {opts['tables']}.")

        User = get_user_model()
        if not User.objects.filter(is_superuser=True).exists():
            self.stdout.write("—" * 40)
            self.stdout.write("Осталось создать администратора:")
            self.stdout.write("  запустите сайт и откройте  http://127.0.0.1:8000/staff/setup/")
            self.stdout.write("  — придумайте свой логин и пароль (потом их можно сменить в панели → «Аккаунт»).")
            self.stdout.write("—" * 40)
