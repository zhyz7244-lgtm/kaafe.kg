import csv
from pathlib import Path

from django.core.management.base import BaseCommand

from shop.models import Book, BookCategory

GENRE_ORDER = ["Куран", "Ислам", "Художественная", "Саморазвитие и бизнес", "Детские", "Словари и учебные"]
DATA = Path(__file__).resolve().parents[2] / "data" / "books.csv"


class Command(BaseCommand):
    help = "Загружает каталог книг из shop/data/books.csv (по коду K-001…). Можно запускать повторно."

    def handle(self, *args, **options):
        with open(DATA, encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f, delimiter=";"))

        categories = {}
        for name in GENRE_ORDER:
            cat = BookCategory.objects.get_or_create(name=name)[0]
            cat.sort_order = len(categories) + 1  # настоящие жанры идут первыми
            cat.save(update_fields=["sort_order"])
            categories[name] = cat
        created = updated = 0
        for order, row in enumerate(rows):
            name = row["Жанр"]
            # Цену и название не затираем, если их уже поменяли в админке: обновляем только новые записи.
            book, was_created = Book.objects.get_or_create(
                sku=row["Код"],
                defaults={
                    "title": row["Название"],
                    "price": int(row["Цена"]),
                    "category": categories[name],
                    "sort_order": order,
                },
            )
            created += was_created
            updated += not was_created

        # Демонстрационные книги (SB-xx) уводим в конец списка, настоящие идут первыми.
        Book.objects.filter(sku__startswith="SB-").update(sort_order=1000)
        BookCategory.objects.exclude(pk__in=[c.pk for c in categories.values()]).update(sort_order=100)
        self.stdout.write(self.style.SUCCESS(f"Книг добавлено: {created}, уже были: {updated}."))
