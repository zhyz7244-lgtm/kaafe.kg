from django.conf import settings
from django.contrib import admin
from django.db.models import Sum
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html

from .models import (
    BonusTransaction, Book, BookCategory, BookOrder, BookOrderItem, Category, Customer, Order,
    OrderItem, Product, Review, ReviewPhoto, Table,
)

admin.site.site_header = "Kaafi — управление"
admin.site.site_title = "Kaafi"
admin.site.index_title = "Панель администратора"
admin.site.index_template = "admin/kaafi_index.html"

_original_index = admin.site.index


def _dashboard_index(request, extra_context=None):
    today = timezone.localdate()
    orders = Order.objects.exclude(status=Order.Status.CANCELLED)
    today_orders = orders.filter(created_at__date=today)
    stats = {
        "new_orders": Order.objects.filter(status=Order.Status.NEW).count(),
        "orders_today": today_orders.count(),
        "revenue_today": today_orders.aggregate(s=Sum("total"))["s"] or 0,
        "pending_reviews": Review.objects.filter(is_approved=False).count(),
        "new_book_orders": BookOrder.objects.filter(status=BookOrder.Status.NEW).count(),
        "customers": Customer.objects.count(),
        "notify_on": bool(
            (settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID)
            or (settings.WHATSAPP_PHONE and settings.CALLMEBOT_APIKEY)
        ),
        "products": Product.objects.count(),
        "discounted": sum(1 for p in Product.objects.filter(discount_percent__gt=0) if p.has_discount),
        "latest": Order.objects.select_related("table").prefetch_related("items")[:6],
    }
    return _original_index(request, {**(extra_context or {}), "stats": stats})


admin.site.index = _dashboard_index


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "sort_order")
    list_editable = ("sort_order",)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = (
        "thumb", "name", "volume", "category", "price", "discount_percent",
        "final_price_display", "is_available", "sort_order",
    )
    list_display_links = ("thumb", "name")
    list_editable = ("price", "discount_percent", "is_available", "sort_order")
    list_filter = ("category", "is_available")
    search_fields = ("name", "description")
    fieldsets = (
        (None, {"fields": ("category", "name", "volume", "description", "image", "price", "sort_order")}),
        ("Скидка", {"fields": ("discount_percent", "discount_until")}),
        ("Наличие", {"fields": ("is_available",)}),
    )

    @admin.display(description="Фото")
    def thumb(self, obj):
        if obj.image:
            return format_html(
                '<img src="{}" style="width:48px;height:48px;object-fit:cover;border-radius:8px">',
                obj.image.url,
            )
        return "—"

    @admin.display(description="Цена со скидкой")
    def final_price_display(self, obj):
        if obj.has_discount:
            return format_html("<b>{} сом</b>", obj.final_price)
        return "—"


@admin.register(Table)
class TableAdmin(admin.ModelAdmin):
    list_display = ("number", "is_active", "qr_preview", "print_link")
    list_editable = ("is_active",)
    readonly_fields = ("token", "qr_preview")
    actions = None

    @admin.display(description="QR-код")
    def qr_preview(self, obj):
        if not obj.pk:
            return "Появится после сохранения"
        return format_html(
            '<img src="{}" style="width:90px;height:90px">',
            reverse("staff_qr_image", args=[obj.pk]),
        )

    @admin.display(description="Печать")
    def print_link(self, obj):
        return format_html(
            '<a href="{}?table={}" target="_blank">Распечатать QR</a>',
            reverse("staff_qr_print"), obj.pk,
        )


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ("name", "price", "qty")
    fields = ("name", "price", "qty")
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("id", "table", "status", "total", "short_items", "created_at")
    list_editable = ("status",)
    list_filter = ("status", "table", "created_at")
    date_hierarchy = "created_at"
    readonly_fields = ("table", "total", "comment", "created_at")
    inlines = [OrderItemInline]

    @admin.display(description="Что заказали")
    def short_items(self, obj):
        return ", ".join(f"{i.name} ×{i.qty}" for i in obj.items.all())

    def has_add_permission(self, request):
        return False


class ReviewPhotoInline(admin.TabularInline):
    model = ReviewPhoto
    extra = 0
    readonly_fields = ("preview",)
    fields = ("image", "preview")

    @admin.display(description="Превью")
    def preview(self, obj):
        if obj.pk and obj.image:
            return format_html('<img src="{}" style="height:80px;border-radius:6px">', obj.image.url)
        return ""


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ("name", "rating", "short_text", "photo_count", "is_approved", "created_at")
    list_editable = ("is_approved",)
    list_filter = ("is_approved", "rating")
    inlines = [ReviewPhotoInline]
    actions = ["approve", "hide"]

    @admin.display(description="Отзыв")
    def short_text(self, obj):
        return obj.text[:80]

    @admin.display(description="Фото")
    def photo_count(self, obj):
        return obj.photos.count()

    @admin.action(description="Опубликовать выбранные")
    def approve(self, request, queryset):
        queryset.update(is_approved=True)

    @admin.action(description="Скрыть выбранные")
    def hide(self, request, queryset):
        queryset.update(is_approved=False)


@admin.register(BookCategory)
class BookCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "books_count", "sort_order")
    list_editable = ("sort_order",)

    @admin.display(description="Книг")
    def books_count(self, obj):
        return obj.books.count()


class NoPhotoFilter(admin.SimpleListFilter):
    title = "фото"
    parameter_name = "photo"

    def lookups(self, request, model_admin):
        return [("no", "Без фото"), ("yes", "С фото")]

    def queryset(self, request, queryset):
        if self.value() == "no":
            return queryset.filter(image="")
        if self.value() == "yes":
            return queryset.exclude(image="")


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ("thumb", "title", "author", "category", "price", "old_price", "is_available", "sku")
    list_display_links = ("thumb", "title")
    list_editable = ("price", "old_price", "is_available")
    list_filter = ("category", "is_available", NoPhotoFilter)
    search_fields = ("title", "author", "sku")
    list_per_page = 50
    actions = ["mark_available", "mark_unavailable"]
    change_list_template = "admin/shop/book/change_list.html"
    fieldsets = (
        (None, {"fields": ("title", "author", "category", "description", "image")}),
        ("Цена", {"fields": ("price", "old_price")}),
        ("Наличие и учёт", {"fields": ("is_available", "sku", "sort_order")}),
    )

    @admin.display(description="Фото")
    def thumb(self, obj):
        if obj.image:
            return format_html(
                '<img src="{}" style="width:40px;height:56px;object-fit:cover;border-radius:4px">',
                obj.image.url,
            )
        return "—"

    @admin.action(description="Отметить «есть в наличии»")
    def mark_available(self, request, queryset):
        queryset.update(is_available=True)

    @admin.action(description="Отметить «нет в наличии»")
    def mark_unavailable(self, request, queryset):
        queryset.update(is_available=False)


class BookOrderItemInline(admin.TabularInline):
    model = BookOrderItem
    extra = 0
    can_delete = False
    fields = ("title", "price", "qty")
    readonly_fields = ("title", "price", "qty")

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(BookOrder)
class BookOrderAdmin(admin.ModelAdmin):
    list_display = ("id", "summary", "total", "name", "phone", "delivery_method", "place", "status", "created_at")
    list_editable = ("status",)
    list_filter = ("status", "delivery_method", "created_at")
    search_fields = ("name", "phone", "city", "items__title")
    date_hierarchy = "created_at"
    inlines = [BookOrderItemInline]
    readonly_fields = (
        "customer", "delivery_method", "name", "phone", "country", "city", "address", "comment", "total",
        "created_at",
    )

    def has_add_permission(self, request):
        return False


class BonusInline(admin.TabularInline):
    model = BonusTransaction
    extra = 0
    can_delete = False
    fields = ("created_at", "amount", "note")
    readonly_fields = ("created_at", "amount", "note")

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "code", "bonus_balance", "created_at")
    search_fields = ("name", "phone", "code")
    readonly_fields = ("name", "phone", "code", "bonus_balance", "created_at")
    inlines = [BonusInline]
    actions = ["reset_password"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return True

    @admin.action(description="Сбросить пароль (выдать временный)")
    def reset_password(self, request, queryset):
        import secrets

        for c in queryset:
            temp = secrets.token_urlsafe(6)
            c.set_password(temp)
            c.save(update_fields=["password"])
            self.message_user(
                request, f"{c.name} (+{c.phone}): временный пароль — {temp}. Передайте его клиенту."
            )
