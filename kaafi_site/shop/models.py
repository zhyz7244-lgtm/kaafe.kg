import uuid
from decimal import ROUND_HALF_UP, Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.urls import reverse
from django.utils import timezone


def validate_image_size(f):
    if f.size > 5 * 1024 * 1024:
        raise ValidationError("Фото слишком большое (максимум 5 МБ).")


class Category(models.Model):
    name = models.CharField("Название", max_length=60)
    sort_order = models.PositiveIntegerField("Порядок", default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        verbose_name = "Категория"
        verbose_name_plural = "Категории"

    def __str__(self):
        return self.name


class Product(models.Model):
    category = models.ForeignKey(
        Category, verbose_name="Категория", on_delete=models.PROTECT, related_name="products"
    )
    name = models.CharField("Название", max_length=100)
    volume = models.CharField("Объём / порция", max_length=30, blank=True, help_text="Например: 300 мл")
    description = models.CharField("Описание", max_length=250, blank=True)
    price = models.PositiveIntegerField("Цена, сом")
    image = models.ImageField(
        "Фото", upload_to="products/", blank=True, validators=[validate_image_size]
    )
    discount_percent = models.PositiveSmallIntegerField(
        "Скидка, %",
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(95)],
        help_text="0 — скидки нет",
    )
    discount_until = models.DateField(
        "Скидка действует до", null=True, blank=True, help_text="Пусто — без ограничения по дате"
    )
    is_available = models.BooleanField("Есть в наличии", default=True)
    sort_order = models.PositiveIntegerField("Порядок", default=0)

    class Meta:
        ordering = ["category__sort_order", "sort_order", "id"]
        verbose_name = "Товар"
        verbose_name_plural = "Товары"

    def __str__(self):
        return f"{self.name} {self.volume}".strip()

    @property
    def art_kind(self):
        """Какую иллюстрацию рисовать, пока нет фото: еда, стакан со льдом или чашка."""
        text = f"{self.name} {self.category.name}".lower()
        if any(w in text for w in ("еда", "десерт", "выпечк", "круассан", "сэндвич", "чизкейк", "брауни", "салат", "торт")):
            return "food"
        if any(w in text for w in ("айс", "холод", "ice", "мохито", "лимонад", "сок", "смузи", "коктейл")):
            return "iced"
        return "hot"

    @property
    def art_tone(self):
        """Цвет напитка по названию: мятный (мохито/лимонад), тёмный (эспрессо/американо) или молочный."""
        name = self.name.lower()
        if any(w in name for w in ("мохито", "лимонад", "mojito")):
            return "mint"
        if any(w in name for w in ("эспрессо", "американо", "espresso", "americano", "чай чёрный", "чай черный")):
            return "dark"
        return "milk"

    @property
    def has_discount(self):
        if not self.discount_percent:
            return False
        if self.discount_until and self.discount_until < timezone.localdate():
            return False
        return True

    @property
    def final_price(self):
        if not self.has_discount:
            return self.price
        value = Decimal(self.price) * (100 - self.discount_percent) / 100
        return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


class Table(models.Model):
    number = models.PositiveIntegerField("Номер стола", unique=True)
    token = models.UUIDField("Код для QR", default=uuid.uuid4, unique=True, editable=False)
    is_active = models.BooleanField("Активен", default=True)

    class Meta:
        ordering = ["number"]
        verbose_name = "Стол"
        verbose_name_plural = "Столы"

    def __str__(self):
        return f"Стол {self.number}"

    def get_absolute_url(self):
        return reverse("table_entry", args=[self.token])


class Order(models.Model):
    class Status(models.TextChoices):
        NEW = "new", "Новый"
        IN_PROGRESS = "in_progress", "Готовится"
        DONE = "done", "Выдан"
        CANCELLED = "cancelled", "Отменён"

    table = models.ForeignKey(
        Table, verbose_name="Стол", on_delete=models.PROTECT, related_name="orders"
    )
    status = models.CharField("Статус", max_length=20, choices=Status.choices, default=Status.NEW)
    comment = models.CharField("Комментарий гостя", max_length=300, blank=True)
    total = models.PositiveIntegerField("Сумма, сом", default=0)
    customer = models.ForeignKey(
        "Customer", verbose_name="Клиент", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="orders",
    )
    bonus_awarded = models.BooleanField("Бонус начислен", default=False, editable=False)
    created_at = models.DateTimeField("Создан", auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Заказ"
        verbose_name_plural = "Заказы"

    def __str__(self):
        return f"Заказ №{self.pk} — стол {self.table.number}"

    @property
    def bonus_amount(self):
        return self.total * BONUS_PERCENT // 100

    def award_bonus(self):
        """1% от суммы — зарегистрированному клиенту, один раз, когда заказ выдан."""
        if self.status != self.Status.DONE or not self.customer_id or self.bonus_awarded:
            return
        # Флаг ставим атомарно, чтобы повторное сохранение не начислило дважды.
        if not Order.objects.filter(pk=self.pk, bonus_awarded=False).update(bonus_awarded=True):
            return
        self.bonus_awarded = True
        if self.bonus_amount > 0:
            self.customer.add_bonus(
                self.bonus_amount, note=f"Бонус {BONUS_PERCENT}% за заказ №{self.pk}", order=self
            )


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, null=True, blank=True, on_delete=models.SET_NULL)
    name = models.CharField("Товар", max_length=140)
    price = models.PositiveIntegerField("Цена за шт., сом")
    qty = models.PositiveIntegerField("Кол-во")

    class Meta:
        verbose_name = "Позиция заказа"
        verbose_name_plural = "Позиции заказа"

    @property
    def subtotal(self):
        return self.price * self.qty

    def __str__(self):
        return f"{self.name} × {self.qty}"


class Review(models.Model):
    name = models.CharField("Имя", max_length=60)
    rating = models.PositiveSmallIntegerField(
        "Оценка", default=5, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    text = models.TextField("Отзыв", max_length=1000, blank=True)
    is_approved = models.BooleanField("Опубликован", default=False)
    created_at = models.DateTimeField("Дата", auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Отзыв"
        verbose_name_plural = "Отзывы"

    def __str__(self):
        return f"{self.name} ({self.rating}★)"


class ReviewPhoto(models.Model):
    review = models.ForeignKey(Review, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField("Фото", upload_to="reviews/", validators=[validate_image_size])

    class Meta:
        verbose_name = "Фото отзыва"
        verbose_name_plural = "Фото отзыва"


# ---------- Книги ----------


class BookCategory(models.Model):
    name = models.CharField("Жанр / раздел", max_length=60)
    sort_order = models.PositiveIntegerField("Порядок", default=0)

    class Meta:
        ordering = ["sort_order", "name"]
        verbose_name = "Жанр книг"
        verbose_name_plural = "Жанры книг"

    def __str__(self):
        return self.name


class Book(models.Model):
    category = models.ForeignKey(
        BookCategory, verbose_name="Жанр", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="books",
    )
    title = models.CharField("Название", max_length=150)
    author = models.CharField("Автор", max_length=100, blank=True)
    description = models.TextField("Описание", max_length=3000, blank=True)
    sku = models.CharField(
        "Код / артикул", max_length=40, blank=True, db_index=True,
        help_text="Необязательно. Нужен для импорта из таблицы и пакетной загрузки фото.",
    )
    price = models.PositiveIntegerField("Цена, сом")
    old_price = models.PositiveIntegerField(
        "Старая цена, сом", null=True, blank=True,
        help_text="Если указать больше текущей цены — на сайте покажется скидка и зачёркнутая цена.",
    )
    image = models.ImageField("Фото", upload_to="books/", blank=True, validators=[validate_image_size])
    is_available = models.BooleanField("Есть в наличии", default=True)
    sort_order = models.PositiveIntegerField("Порядок", default=0)
    created_at = models.DateTimeField("Добавлена", default=timezone.now, editable=False)
    # Нижний регистр для поиска: SQLite не умеет регистронезависимый поиск по кириллице.
    search_text = models.CharField(max_length=400, editable=False, default="")

    class Meta:
        ordering = ["sort_order", "-created_at", "id"]
        verbose_name = "Книга"
        verbose_name_plural = "Книги"

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        self.search_text = " ".join(filter(None, [self.title, self.author, self.sku])).lower()[:400]
        fields = kwargs.get("update_fields")
        if fields is not None and "search_text" not in fields and fields:
            kwargs["update_fields"] = list(fields) + ["search_text"]
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse("book_detail", args=[self.pk])

    @property
    def has_discount(self):
        return bool(self.old_price and self.old_price > self.price)

    @property
    def discount_percent(self):
        if not self.has_discount:
            return 0
        return round((self.old_price - self.price) / self.old_price * 100)


class BookOrder(models.Model):
    class Status(models.TextChoices):
        NEW = "new", "Новый"
        IN_PROGRESS = "in_progress", "В работе"
        DONE = "done", "Выполнен"
        CANCELLED = "cancelled", "Отменён"

    class Delivery(models.TextChoices):
        DELIVERY = "delivery", "Доставка"
        PICKUP = "pickup", "Самовывоз из кофейни"

    customer = models.ForeignKey(
        "Customer", verbose_name="Клиент", null=True, blank=True, on_delete=models.SET_NULL,
        related_name="book_orders",
    )
    delivery_method = models.CharField(
        "Получение", max_length=20, choices=Delivery.choices, default=Delivery.DELIVERY
    )
    name = models.CharField("Имя", max_length=100)
    phone = models.CharField("Телефон", max_length=30)
    country = models.CharField("Страна", max_length=60, blank=True)
    city = models.CharField("Город", max_length=60, blank=True)
    address = models.CharField("Адрес", max_length=200, blank=True)
    comment = models.CharField("Комментарий", max_length=300, blank=True)
    total = models.PositiveIntegerField("Сумма, сом", default=0)
    status = models.CharField("Статус", max_length=20, choices=Status.choices, default=Status.NEW)
    created_at = models.DateTimeField("Создан", auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Заказ книг"
        verbose_name_plural = "Заказы книг"

    def __str__(self):
        return f"Заказ книг №{self.pk}"

    @property
    def place(self):
        if self.delivery_method == self.Delivery.PICKUP:
            return "Самовывоз из кофейни"
        return ", ".join(x for x in (self.country, self.city, self.address) if x)

    @property
    def summary(self):
        return ", ".join(f"{i.title} ×{i.qty}" for i in self.items.all())


class BookOrderItem(models.Model):
    order = models.ForeignKey(BookOrder, on_delete=models.CASCADE, related_name="items")
    book = models.ForeignKey(Book, null=True, blank=True, on_delete=models.SET_NULL)
    title = models.CharField("Книга", max_length=150)
    price = models.PositiveIntegerField("Цена за шт., сом")
    qty = models.PositiveIntegerField("Кол-во")

    class Meta:
        verbose_name = "Позиция заказа книг"
        verbose_name_plural = "Позиции заказа книг"

    @property
    def subtotal(self):
        return self.price * self.qty

    def __str__(self):
        return f"{self.title} × {self.qty}"


# ---------- Постоянные гости и бонусы ----------

BONUS_PERCENT = 1


class Customer(models.Model):
    """Зарегистрированный гость. Отдельно от администраторов (django.contrib.auth)."""

    name = models.CharField("Имя", max_length=60)
    phone = models.CharField("Телефон", max_length=15, unique=True, help_text="Только цифры")
    password = models.CharField("Хэш пароля", max_length=128, editable=False)
    code = models.CharField("Код (в QR)", max_length=6, unique=True, editable=False)
    bonus_balance = models.IntegerField("Бонусы", default=0)
    created_at = models.DateTimeField("Зарегистрирован", auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Клиент"
        verbose_name_plural = "Клиенты"

    def __str__(self):
        return f"{self.name} (+{self.phone})"

    @property
    def qr_text(self):
        return f"KAAFI-{self.code}"

    @property
    def qr_url(self):
        """Что зашито в QR гостя: ссылка на кассу. Бариста сканирует камерой телефона — карточка гостя
        открывается сразу (после входа в панель). Внутренний сканер понимает и эту ссылку, и «KAAFI-123456»."""
        from django.conf import settings

        return f"{settings.SITE_URL}/staff/customers/?code={self.code}"

    def set_password(self, raw):
        from django.contrib.auth.hashers import make_password

        self.password = make_password(raw)

    def check_password(self, raw):
        from django.contrib.auth.hashers import check_password

        return check_password(raw, self.password)

    @staticmethod
    def new_code():
        import secrets

        while True:
            code = str(secrets.randbelow(900000) + 100000)
            if not Customer.objects.filter(code=code).exists():
                return code

    def add_bonus(self, amount, note="", order=None):
        """Начислить (amount > 0) или списать (< 0) бонусы. Баланс не уходит в минус."""
        from django.db import transaction
        from django.db.models import F

        with transaction.atomic():
            locked = Customer.objects.select_for_update().get(pk=self.pk)
            if locked.bonus_balance + amount < 0:
                raise ValidationError("Недостаточно бонусов на балансе.")
            Customer.objects.filter(pk=self.pk).update(bonus_balance=F("bonus_balance") + amount)
            BonusTransaction.objects.create(customer=self, amount=amount, note=note, order=order)
        self.refresh_from_db(fields=["bonus_balance"])


class BonusTransaction(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="transactions")
    amount = models.IntegerField("Бонусы")
    note = models.CharField("Комментарий", max_length=200, blank=True)
    order = models.ForeignKey("Order", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField("Дата", auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name = "Операция с бонусами"
        verbose_name_plural = "Операции с бонусами"


from django.db.models.signals import post_save  # noqa: E402
from django.dispatch import receiver  # noqa: E402


@receiver(post_save, sender=Order)
def _award_bonus_on_done(sender, instance, **kwargs):
    instance.award_bonus()
