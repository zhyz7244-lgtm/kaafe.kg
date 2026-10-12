import io
import json
import re
import time

import qrcode
from django.conf import settings
from django.contrib.admin.views.decorators import staff_member_required
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from django.http import Http404, HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST

from .forms import LoginForm, RegisterForm, ReviewForm
from .models import (
    BONUS_PERCENT, Book, BookCategory, BookOrder, BookOrderItem, Category, Customer, Order,
    OrderItem, Product, Review, ReviewPhoto, Table,
)
from .notify import notify_book_order, notify_new_order, notify_review

SESSION_TABLE = "table_id"
SESSION_CUSTOMER = "customer_id"
ORDER_COOLDOWN_SEC = 10


def _session_table(request):
    table_id = request.session.get(SESSION_TABLE)
    if not table_id:
        return None
    return Table.objects.filter(pk=table_id, is_active=True).first()


def _session_customer(request):
    cid = request.session.get(SESSION_CUSTOMER)
    return Customer.objects.filter(pk=cid).first() if cid else None


# ---------- публичная часть ----------


def _home_context(request, **extra):
    from django.db.models import Avg, Count

    agg = Review.objects.filter(is_approved=True).aggregate(n=Count("id"), avg=Avg("rating"))
    # Только категории, где есть хотя бы один товар.
    categories = [c for c in Category.objects.prefetch_related("products") if c.products.all()]
    return {
        "categories": categories,
        "featured_books": Book.objects.filter(is_available=True).order_by("-created_at", "-id")[:6],
        "books_total": Book.objects.count(),
        "reviews": Review.objects.filter(is_approved=True).prefetch_related("photos")[:12],
        "table": _session_table(request),
        "tables": Table.objects.filter(is_active=True),
        "customer": _session_customer(request),
        "bonus_percent": BONUS_PERCENT,
        "review_count": agg["n"],
        "review_avg": f"{agg['avg']:.1f}".replace(".", ",") if agg["n"] else "",
        "review_form": ReviewForm(),
        "review_sent": request.GET.get("review") == "sent",
        **extra,
    }


def home(request):
    return render(request, "shop/home.html", _home_context(request))


def table_entry(request, token):
    """Сюда ведёт QR-код на столе: запоминаем стол и открываем меню."""
    table = get_object_or_404(Table, token=token, is_active=True)
    request.session[SESSION_TABLE] = table.pk
    return redirect("home")


@require_POST
def order_create(request):
    try:
        payload = json.loads(request.body)
        raw_items = payload["items"]
        assert isinstance(raw_items, list) and 0 < len(raw_items) <= 40
    except (ValueError, KeyError, AssertionError, TypeError):
        return JsonResponse({"error": "Корзина пуста или повреждена."}, status=400)

    table = _session_table(request)
    if table is None:
        try:
            table = Table.objects.get(number=int(payload.get("table_number")), is_active=True)
        except (TypeError, ValueError, Table.DoesNotExist):
            return JsonResponse({"error": "Выберите номер стола."}, status=400)

    last = request.session.get("last_order_ts", 0)
    if time.time() - last < ORDER_COOLDOWN_SEC:
        return JsonResponse({"error": "Подождите несколько секунд перед новым заказом."}, status=429)

    quantities = {}
    try:
        for row in raw_items:
            pid, qty = int(row["id"]), int(row["qty"])
            if not 1 <= qty <= 50:
                raise ValueError
            quantities[pid] = quantities.get(pid, 0) + qty
    except (KeyError, TypeError, ValueError):
        return JsonResponse({"error": "Некорректное количество."}, status=400)

    products = {p.pk: p for p in Product.objects.filter(pk__in=quantities, is_available=True)}
    missing = [pid for pid in quantities if pid not in products]
    if missing:
        return JsonResponse(
            {"error": "Некоторых позиций уже нет в наличии. Обновите страницу."}, status=409
        )

    customer = _session_customer(request)
    with transaction.atomic():
        order = Order.objects.create(
            table=table, comment=str(payload.get("comment", ""))[:300].strip(), customer=customer
        )
        total = 0
        for pid, qty in quantities.items():
            p = products[pid]
            price = p.final_price  # цену считает сервер, а не браузер
            OrderItem.objects.create(
                order=order, product=p, name=str(p), price=price, qty=qty
            )
            total += price * qty
        order.total = total
        order.save(update_fields=["total"])

    request.session["last_order_ts"] = time.time()
    request.session["my_orders"] = (request.session.get("my_orders", []) + [order.pk])[-20:]
    transaction.on_commit(lambda: notify_new_order(order))
    return JsonResponse(
        {"ok": True, "order_id": order.pk, "table": table.number, "total": total,
         "bonus": order.bonus_amount if customer else 0}
    )


@require_GET
def order_status(request, pk):
    """Статус заказа для гостя, который его оформил (по сессии)."""
    if pk not in request.session.get("my_orders", []):
        raise Http404
    order = get_object_or_404(Order, pk=pk)
    return JsonResponse({"status": order.status, "label": order.get_status_display()})


@require_POST
def review_create(request):
    form = ReviewForm(request.POST)
    photos = request.FILES.getlist("photos")[:4]
    if form.is_valid() and not form.cleaned_data["text"].strip() and not photos:
        form.add_error(None, "Напишите отзыв или приложите фото.")
    if form.is_valid():
        # Проверяем фото до сохранения отзыва.
        from django import forms as dj_forms

        checked = []
        for f in photos:
            field = dj_forms.ImageField()
            try:
                field.clean(f)
            except dj_forms.ValidationError:
                form.add_error(None, "Файл не является фотографией.")
                break
            if f.size > 5 * 1024 * 1024:
                form.add_error(None, "Фото слишком большое (максимум 5 МБ).")
                break
            checked.append(f)
        if not form.errors:
            review = form.save()
            transaction.on_commit(lambda: notify_review(review))
            for f in checked:
                ReviewPhoto.objects.create(review=review, image=f)
            return redirect("/?review=sent#reviews")

    # Ошибки — показываем страницу заново с формой.
    ctx = _home_context(request, review_form=form, review_open=True)
    return render(request, "shop/home.html", ctx, status=400)


BOOKS_PER_PAGE = 24
BOOK_SORTS = {
    "new": ("Сначала новые", ("sort_order", "-created_at", "-id")),
    "price_asc": ("Сначала дешевле", ("price", "title")),
    "price_desc": ("Сначала дороже", ("-price", "title")),
    "title": ("По названию", ("title",)),
}


def _books_nav_context(request):
    return {
        "customer": _session_customer(request),
        "bonus_percent": BONUS_PERCENT,
        "book_categories": BookCategory.objects.annotate(n=Count("books")).filter(n__gt=0).order_by("sort_order", "name"),
    }


# Заказ книг уходит через fetch с X-CSRFToken, поэтому cookie должна быть выдана
# даже тому, кто впервые открыл сразу каталог или страницу книги.
@ensure_csrf_cookie
def books(request):
    """Каталог книг: поиск, жанры, сортировка, страницы."""
    q = request.GET.get("q", "").strip()
    cat = request.GET.get("cat", "")
    sort = request.GET.get("sort", "new")
    if sort not in BOOK_SORTS:
        sort = "new"
    qs = Book.objects.select_related("category")
    if q:
        for word in q.lower().split():
            qs = qs.filter(search_text__contains=word)
    current_cat = None
    if cat.isdigit():
        current_cat = BookCategory.objects.filter(pk=int(cat)).first()
        if current_cat:
            qs = qs.filter(category=current_cat)
    # В наличии — сверху, затем выбранная сортировка.
    qs = qs.order_by("-is_available", *BOOK_SORTS[sort][1])
    page = Paginator(qs, BOOKS_PER_PAGE).get_page(request.GET.get("page"))
    params = request.GET.copy()
    params.pop("page", None)
    ctx = {
        "page": page,
        "q": q,
        "cat": current_cat,
        "sort": sort,
        "sorts": [(k, v[0]) for k, v in BOOK_SORTS.items()],
        "querystring": params.urlencode(),
        "total_books": Book.objects.count(),
        **_books_nav_context(request),
    }
    return render(request, "shop/books.html", ctx)


@ensure_csrf_cookie
def book_detail(request, pk):
    book = get_object_or_404(Book.objects.select_related("category"), pk=pk)
    similar = Book.objects.filter(is_available=True).exclude(pk=book.pk)
    if book.category_id:
        similar = similar.filter(category_id=book.category_id)
    ctx = {"book": book, "similar": similar.order_by("-created_at")[:4], **_books_nav_context(request)}
    return render(request, "shop/book_detail.html", ctx)


@require_POST
def book_order_create(request):
    """Заказ книг из корзины (несколько книг): доставка нами или самовывоз."""
    try:
        payload = json.loads(request.body)
        raw_items = payload["items"]
        assert isinstance(raw_items, list) and 0 < len(raw_items) <= 60
    except (ValueError, KeyError, AssertionError, TypeError):
        return JsonResponse({"error": "Корзина пуста или повреждена."}, status=400)

    def text(key, limit):
        return str(payload.get(key, "") or "").strip()[:limit]

    method = payload.get("delivery_method")
    if method not in BookOrder.Delivery.values:
        return JsonResponse({"error": "Выберите способ получения."}, status=400)
    name, phone = text("name", 100), text("phone", 30)
    country, city, address = text("country", 60), text("city", 60), text("address", 200)
    if not name:
        return JsonResponse({"error": "Укажите ваше имя."}, status=400)
    if sum(ch.isdigit() for ch in phone) < 9:
        return JsonResponse({"error": "Укажите корректный номер телефона."}, status=400)
    if method == BookOrder.Delivery.DELIVERY and not (country and city and address):
        return JsonResponse({"error": "Для доставки укажите страну, город и адрес."}, status=400)

    last = request.session.get("last_book_order_ts", 0)
    if time.time() - last < 5:
        return JsonResponse({"error": "Подождите несколько секунд перед новым заказом."}, status=429)

    quantities = {}
    try:
        for row in raw_items:
            bid, qty = int(row["id"]), int(row["qty"])
            if not 1 <= qty <= 20:
                raise ValueError
            quantities[bid] = quantities.get(bid, 0) + qty
    except (KeyError, TypeError, ValueError):
        return JsonResponse({"error": "Некорректное количество."}, status=400)
    found = {b.pk: b for b in Book.objects.filter(pk__in=quantities, is_available=True)}
    gone = [b for b in quantities if b not in found]
    if gone:
        return JsonResponse(
            {"error": "Некоторых книг уже нет в наличии — уберите их из корзины.", "gone": gone}, status=409
        )

    with transaction.atomic():
        order = BookOrder.objects.create(
            customer=_session_customer(request), delivery_method=method, name=name, phone=phone,
            country=country if method == BookOrder.Delivery.DELIVERY else "",
            city=city if method == BookOrder.Delivery.DELIVERY else "",
            address=address if method == BookOrder.Delivery.DELIVERY else "",
            comment=text("comment", 300),
        )
        total = 0
        for bid, qty in quantities.items():
            b = found[bid]  # цену считает сервер, а не браузер
            BookOrderItem.objects.create(order=order, book=b, title=b.title, price=b.price, qty=qty)
            total += b.price * qty
        order.total = total
        order.save(update_fields=["total"])
    request.session["last_book_order_ts"] = time.time()
    transaction.on_commit(lambda: notify_book_order(order))
    return JsonResponse({"ok": True, "order_id": order.pk, "total": total, "delivery": method})


# ---------- регистрация и профиль гостя ----------


def account(request):
    customer = _session_customer(request)
    if customer is None:
        mode = "login" if request.GET.get("mode") == "login" else "register"
        return render(
            request,
            "shop/account.html",
            {"mode": mode, "register_form": RegisterForm(), "login_form": LoginForm()},
        )
    return render(
        request,
        "shop/account.html",
        {
            "customer": customer,
            "transactions": customer.transactions.all()[:50],
            "orders": customer.orders.all()[:20],
            "bonus_percent": BONUS_PERCENT,
        },
    )


@require_POST
def account_register(request):
    form = RegisterForm(request.POST)
    if form.is_valid():
        c = Customer(
            name=form.cleaned_data["name"], phone=form.cleaned_data["phone"], code=Customer.new_code()
        )
        c.set_password(form.cleaned_data["password"])
        c.save()
        request.session.cycle_key()
        request.session[SESSION_CUSTOMER] = c.pk
        return redirect("account")
    return render(
        request,
        "shop/account.html",
        {"mode": "register", "register_form": form, "login_form": LoginForm()},
        status=400,
    )


@require_POST
def account_login(request):
    form = LoginForm(request.POST)
    if form.is_valid():
        attempts = [t for t in request.session.get("login_fail", []) if time.time() - t < 900]
        if len(attempts) >= 8:
            form.add_error(None, "Слишком много попыток, попробуйте через 15 минут.")
        else:
            c = Customer.objects.filter(phone=form.cleaned_data["phone"]).first()
            if c and c.check_password(form.cleaned_data["password"]):
                request.session.cycle_key()
                request.session[SESSION_CUSTOMER] = c.pk
                return redirect("account")
            request.session["login_fail"] = attempts + [time.time()]
            form.add_error(None, "Неверный телефон или пароль.")
    return render(
        request,
        "shop/account.html",
        {"mode": "login", "register_form": RegisterForm(), "login_form": form},
        status=400,
    )


@require_POST
def account_logout(request):
    request.session.pop(SESSION_CUSTOMER, None)
    return redirect("home")


def account_qr(request):
    customer = _session_customer(request)
    if customer is None:
        raise Http404
    return HttpResponse(_qr_png(customer.qr_url), content_type="image/png")


# ---------- для администратора / персонала ----------


@staff_member_required
def staff_orders(request):
    return render(request, "shop/staff_orders.html", {"statuses": Order.Status.choices})


def _order_json(o):
    return {
        "id": o.pk,
        "table": o.table.number,
        "status": o.status,
        "status_label": o.get_status_display(),
        "total": o.total,
        "comment": o.comment,
        "time": o.created_at.astimezone().strftime("%H:%M"),
        "customer": (
            {"name": o.customer.name, "balance": o.customer.bonus_balance, "code": o.customer.qr_text}
            if o.customer_id else None
        ),
        "items": [{"name": i.name, "qty": i.qty, "subtotal": i.subtotal} for i in o.items.all()],
    }


def _book_order_json(b):
    return {
        "id": b.pk, "total": b.total, "name": b.name, "phone": b.phone, "place": b.place,
        "delivery": b.delivery_method, "delivery_label": b.get_delivery_method_display(),
        "comment": b.comment, "status": b.status,
        "items": [{"title": i.title, "qty": i.qty, "subtotal": i.subtotal} for i in b.items.all()],
        "time": timezone.localtime(b.created_at).strftime("%d.%m %H:%M"),
    }


@staff_member_required
@require_GET
def staff_orders_feed(request):
    qs = Order.objects.select_related("table", "customer").prefetch_related("items")
    active = qs.filter(status__in=[Order.Status.NEW, Order.Status.IN_PROGRESS]).order_by("created_at")
    recent = qs.filter(status__in=[Order.Status.DONE, Order.Status.CANCELLED])[:15]
    latest = Order.objects.order_by("-pk").values_list("pk", flat=True).first() or 0
    books = BookOrder.objects.filter(
        status__in=[BookOrder.Status.NEW, BookOrder.Status.IN_PROGRESS]
    ).prefetch_related("items").order_by("created_at")
    latest_book = BookOrder.objects.order_by("-pk").values_list("pk", flat=True).first() or 0
    return JsonResponse(
        {
            "latest_id": latest,
            "latest_book_id": latest_book,
            "active": [_order_json(o) for o in active],
            "recent": [_order_json(o) for o in recent],
            "books": [_book_order_json(b) for b in books],
        }
    )


@staff_member_required
@require_POST
def staff_book_status(request, pk):
    order = get_object_or_404(BookOrder, pk=pk)
    status = request.POST.get("status")
    if status not in BookOrder.Status.values:
        return JsonResponse({"error": "bad status"}, status=400)
    order.status = status
    order.save(update_fields=["status"])
    return JsonResponse({"ok": True})


@staff_member_required
@require_POST
def staff_order_status(request, pk):
    order = get_object_or_404(Order, pk=pk)
    status = request.POST.get("status")
    if status not in Order.Status.values:
        return JsonResponse({"error": "bad status"}, status=400)
    order.status = status
    order.save(update_fields=["status"])
    return JsonResponse({"ok": True})


def _qr_png(url):
    img = qrcode.make(url, box_size=10, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _table_url(request, table):
    return settings.SITE_URL + table.get_absolute_url()


@staff_member_required
def staff_qr_image(request, pk):
    table = get_object_or_404(Table, pk=pk)
    return HttpResponse(_qr_png(_table_url(request, table)), content_type="image/png")


@staff_member_required
def staff_qr_print(request):
    """Страница для печати: QR-код каждого стола на отдельной карточке."""
    tables = Table.objects.filter(is_active=True)
    only = request.GET.get("table")
    if only:
        tables = tables.filter(pk=only)
        if not tables:
            raise Http404
    host = settings.SITE_URL.split("//")[-1].split("/")[0].split(":")[0]
    is_local = host in ("127.0.0.1", "localhost", "0.0.0.0") or host.startswith(("192.168.", "10."))
    return render(
        request,
        "shop/qr_print.html",
        {"tables": [(t, _table_url(request, t)) for t in tables], "is_local": is_local,
         "site_url": settings.SITE_URL},
    )


@staff_member_required
def staff_customers(request):
    """Касса: найти клиента по QR/телефону/коду и начислить или списать бонусы."""
    return render(request, "shop/staff_customers.html")


def _customer_json(c):
    return {
        "id": c.pk, "name": c.name, "phone": c.phone, "code": c.qr_text, "balance": c.bonus_balance,
        "history": [
            {"amount": t.amount, "note": t.note,
             "date": timezone.localtime(t.created_at).strftime("%d.%m.%Y %H:%M")}
            for t in c.transactions.all()[:15]
        ],
    }


@staff_member_required
@require_GET
def staff_customers_lookup(request):
    from django.db.models import Q

    q = request.GET.get("q", "").strip()
    if not q:
        return JsonResponse({"results": []})
    m = re.search(r"(?:code=|KAAFI-)(\d{6})", q, re.I)
    if m:  # отсканирован QR гостя (ссылка или «KAAFI-123456»)
        q = m.group(1)
    digits = "".join(ch for ch in q if ch.isdigit())
    code = q.upper().removeprefix("KAAFI-")
    cond = Q(code=code)
    if digits:
        cond |= Q(phone__contains=digits)
    found = list(Customer.objects.filter(cond)[:20])
    if not found:  # поиск по имени — в Python: SQLite не различает регистр только у латиницы
        low = q.lower()
        found = [c for c in Customer.objects.all() if low in c.name.lower()][:20]
    return JsonResponse({"results": [_customer_json(c) for c in found]})


@staff_member_required
@require_POST
def staff_customer_bonus(request, pk):
    from django.core.exceptions import ValidationError

    customer = get_object_or_404(Customer, pk=pk)
    check = request.POST.get("check", "").strip()
    if check:  # кассир вводит сумму чека за кофе — бонус считается сам (1%)
        try:
            check_sum = int(check)
            assert 0 < check_sum <= 1_000_000
        except (ValueError, AssertionError):
            return JsonResponse({"error": "Введите сумму чека числом."}, status=400)
        amount = check_sum * BONUS_PERCENT // 100
        if amount < 1:
            return JsonResponse({"error": f"С чека {check_sum} сом бонус меньше 1 — нечего начислять."}, status=400)
        note = f"Бонус {BONUS_PERCENT}% с чека {check_sum} сом"
    else:
        try:
            amount = int(request.POST.get("amount", ""))
            assert amount != 0 and abs(amount) <= 1_000_000
        except (ValueError, AssertionError):
            return JsonResponse({"error": "Введите целое число бонусов (минус — списать)."}, status=400)
        note = request.POST.get("note", "").strip()[:200] or (
            "Начислено администратором" if amount > 0 else "Списано администратором"
        )
    try:
        customer.add_bonus(amount, note=note)
    except ValidationError as e:
        return JsonResponse({"error": e.messages[0]}, status=400)
    return JsonResponse({"customer": _customer_json(customer)})


MONTH_NAMES = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]


def _delta(cur, prev):
    if prev == 0:
        return None if cur == 0 else "новое"
    return f"{round((cur - prev) / prev * 100):+d}%"


FULL_MONTHS = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
]


def _sales_by_section(year, month):
    """Продажи по разделам за период: каждая категория меню и «Книги». Отменённые заказы не считаются."""
    from django.db.models import F, IntegerField, Sum, Value
    from django.db.models.functions import Coalesce

    def period(qs):
        qs = qs.filter(order__created_at__year=year)
        return qs.filter(order__created_at__month=month) if month else qs

    revenue = Sum(F("price") * F("qty"), output_field=IntegerField())
    cafe = period(OrderItem.objects.exclude(order__status=Order.Status.CANCELLED))
    sections = [
        {"name": r["sec"], "qty": r["units"], "revenue": r["rev"] or 0, "orders": r["orders"], "is_book": False}
        for r in cafe.values(sec=Coalesce("product__category__name", Value("Прочее")))
        .annotate(units=Sum("qty"), rev=revenue, orders=Count("order", distinct=True))
    ]
    books = period(BookOrderItem.objects.exclude(order__status=BookOrder.Status.CANCELLED))
    agg = books.aggregate(units=Sum("qty"), rev=revenue, orders=Count("order", distinct=True))
    if agg["units"]:
        sections.append({"name": "Книги", "qty": agg["units"], "revenue": agg["rev"] or 0,
                         "orders": agg["orders"], "is_book": True})

    # порядок разделов — как в меню, «Книги» и «Прочее» в конце
    order = {c.name: i for i, c in enumerate(Category.objects.all())}
    sections.sort(key=lambda x: (x["name"] == "Прочее", x["is_book"], order.get(x["name"], 999)))
    total = sum(x["revenue"] for x in sections) or 1
    best = max([x["revenue"] for x in sections] + [1])
    for x in sections:
        x["share"] = round(x["revenue"] / total * 100)
        x["bar"] = round(x["revenue"] / best * 100)

    top_menu = [
        {"name": r["name"], "section": r["sec"], "qty": r["units"], "revenue": r["rev"] or 0}
        for r in cafe.values("name", sec=Coalesce("product__category__name", Value("Прочее")))
        .annotate(units=Sum("qty"), rev=revenue).order_by("-rev")[:10]
    ]
    top_books = [
        {"name": r["title"], "qty": r["units"], "revenue": r["rev"] or 0}
        for r in books.values("title").annotate(units=Sum("qty"), rev=revenue).order_by("-rev")[:10]
    ]
    return sections, top_menu, top_books


@staff_member_required
def staff_stats(request):
    """Статистика: период (год/месяц), разделы меню и книги, топы, месяцы и годы. Без отменённых заказов."""
    from django.db.models import Count, Sum
    from django.db.models.functions import ExtractMonth, ExtractYear

    today = timezone.localdate()
    try:
        year = int(request.GET.get("year", today.year))
        month = int(request.GET.get("month", 0))
    except ValueError:
        year, month = today.year, 0
    if not 0 <= month <= 12:
        month = 0

    data = {}  # (год, месяц) -> [заказов кофейни, выручка кофейни, заказов книг, выручка книг]
    cafe = Order.objects.exclude(status=Order.Status.CANCELLED)
    for r in (
        cafe.annotate(y=ExtractYear("created_at"), m=ExtractMonth("created_at"))
        .values("y", "m").annotate(n=Count("id"), s=Sum("total"))
    ):
        data.setdefault((r["y"], r["m"]), [0, 0, 0, 0])[0:2] = [r["n"], r["s"] or 0]
    books_today = []
    for bo in BookOrder.objects.exclude(status=BookOrder.Status.CANCELLED):
        d = timezone.localtime(bo.created_at)
        row = data.setdefault((d.year, d.month), [0, 0, 0, 0])
        row[2] += 1
        row[3] += bo.total
        if d.date() == today:
            books_today.append(bo)

    def bucket(keys):
        t = [0, 0, 0, 0]
        for k in keys:
            for i, v in enumerate(data.get(k, [0, 0, 0, 0])):
                t[i] += v
        orders = t[0] + t[2]
        return {
            "cafe_orders": t[0], "book_orders": t[2], "orders": orders,
            "cafe_revenue": t[1], "book_revenue": t[3], "revenue": t[1] + t[3],
            "avg_check": round(t[1] / t[0]) if t[0] else 0,
        }

    prev_m = (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)
    this_month, last_month = bucket([(today.year, today.month)]), bucket([prev_m])
    this_year = bucket([k for k in data if k[0] == today.year])
    last_year = bucket([k for k in data if k[0] == today.year - 1])

    months = [{"name": MONTH_NAMES[i - 1], "num": i, **bucket([(year, i)])} for i in range(1, 13)]
    max_rev = max([m["revenue"] for m in months] + [1])
    for m in months:
        m["pct"] = round(m["revenue"] / max_rev * 100)
        m["cafe_pct"] = round(m["cafe_revenue"] / max_rev * 100)
        m["book_pct"] = round(m["book_revenue"] / max_rev * 100)

    year_list = sorted({k[0] for k in data} | {today.year})
    years = [{"year": y, **bucket([k for k in data if k[0] == y])} for y in year_list]
    for i, y in enumerate(years):
        y["delta"] = _delta(y["revenue"], years[i - 1]["revenue"]) if i else None

    sections, top_menu, top_books = _sales_by_section(year, month)
    period_keys = [(year, month)] if month else [k for k in data if k[0] == year]
    period = bucket(period_keys)
    period_label = f"{FULL_MONTHS[month - 1]} {year}" if month else f"{year} год"

    today_cafe = cafe.filter(created_at__date=today)
    return render(
        request,
        "shop/staff_stats.html",
        {
            "year": year, "month": month, "year_list": year_list, "full_months": list(enumerate(FULL_MONTHS, 1)),
            "months": months, "years": years,
            "sections": sections, "top_menu": top_menu, "top_books": top_books,
            "period": period, "period_label": period_label,
            "best_section": max(sections, key=lambda x: x["revenue"]) if sections else None,
            "this_month": this_month, "last_month": last_month,
            "month_delta": _delta(this_month["revenue"], last_month["revenue"]),
            "this_year": this_year, "last_year": last_year,
            "cur_year": today.year, "prev_year": today.year - 1,
            "year_delta": _delta(this_year["revenue"], last_year["revenue"]),
            "today_orders": today_cafe.count() + len(books_today),
            "today_revenue": (today_cafe.aggregate(s=Sum("total"))["s"] or 0)
            + sum(b.total for b in books_today),
        },
    )


# ---------- настройка уведомлений ----------


@staff_member_required
def staff_notifications(request):
    from . import notify

    return render(
        request,
        "shop/staff_notifications.html",
        {
            "tg": notify.telegram_status(),
            "wa": notify.whatsapp_status(),
            "chat_id": settings.TELEGRAM_CHAT_ID,
            "wa_phone": settings.WHATSAPP_PHONE,
            "is_super": request.user.is_superuser,
        },
    )


@staff_member_required
@require_POST
def staff_notifications_save(request):
    import re

    if not request.user.is_superuser:
        return JsonResponse({"error": "Менять настройки может только главный администратор."}, status=403)
    updates = {}
    token = request.POST.get("token", "").strip()
    chat = request.POST.get("chat_id", "").strip().replace(" ", "")
    phone = "".join(ch for ch in request.POST.get("wa_phone", "") if ch.isdigit())
    key = request.POST.get("wa_key", "").strip()
    if token:
        if not re.fullmatch(r"\d{5,}:[\w-]{20,}", token):
            return JsonResponse({"error": "Токен выглядит неверно. Он такой: 123456789:AAH... (его выдаёт @BotFather)."}, status=400)
        updates["TELEGRAM_BOT_TOKEN"] = token
    if chat or request.POST.get("chat_id") == "":
        if chat and not re.fullmatch(r"-?\d+(,-?\d+)*", chat):
            return JsonResponse({"error": "Chat id — это число (или несколько через запятую)."}, status=400)
        updates["TELEGRAM_CHAT_ID"] = chat
    if request.POST.get("wa_phone") is not None:
        updates["WHATSAPP_PHONE"] = phone
    if key:
        updates["CALLMEBOT_APIKEY"] = key
    from . import notify

    notify.save_env(updates)
    return JsonResponse({"ok": True})


@staff_member_required
@require_POST
def staff_notifications_action(request, action):
    from . import notify

    if action == "find-chat":
        if not settings.TELEGRAM_BOT_TOKEN:
            return JsonResponse({"error": "Сначала сохраните токен бота."}, status=400)
        try:
            chats = notify.find_telegram_chats()
        except Exception as e:
            return JsonResponse({"error": f"Не удалось связаться с Telegram: {e}"}, status=400)
        if not chats:
            return JsonResponse({"error": "Чатов не найдено. Откройте своего бота в Telegram, нажмите «Старт» (или напишите ему любое сообщение) и нажмите кнопку ещё раз."}, status=404)
        return JsonResponse({"chats": [{"id": cid, "name": name} for cid, name in chats]})
    if action == "test-telegram":
        ok, msg = notify.check_telegram()
    elif action == "test-whatsapp":
        ok, msg = notify.check_whatsapp()
    else:
        raise Http404
    return JsonResponse({"ok": ok, "message": msg}, status=200 if ok else 400)


# ---------- импорт книг и пакетная загрузка фото ----------

IMPORT_COLUMNS = {
    "title": ("название", "title", "книга", "наименование"),
    "author": ("автор", "author"),
    "price": ("цена", "price", "цена, сом"),
    "old_price": ("старая цена", "old_price", "цена до скидки", "old price"),
    "category": ("жанр", "категория", "category", "раздел"),
    "description": ("описание", "description"),
    "sku": ("код", "артикул", "sku", "код / артикул"),
    "available": ("в наличии", "наличие", "available", "in_stock"),
}


def _to_int(value):
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return int(digits) if digits else None


def _decode_csv(raw):
    for enc in ("utf-8-sig", "cp1251"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ValueError("Не удалось прочитать файл. Сохраните таблицу как «CSV UTF-8».")


def import_books_from_csv(raw):
    """Создаёт/обновляет книги из CSV. Совпадение — по коду (если есть), иначе по названию+автору."""
    import csv
    import io

    text = _decode_csv(raw)
    try:
        dialect = csv.Sniffer().sniff(text[:4000], delimiters=";,\t")
    except csv.Error:
        dialect = csv.excel
    rows = list(csv.reader(io.StringIO(text), dialect))
    if not rows:
        raise ValueError("Файл пустой.")
    header = [h.strip().lower() for h in rows[0]]
    cols = {}
    for key, names in IMPORT_COLUMNS.items():
        for i, h in enumerate(header):
            if h in names:
                cols[key] = i
                break
    if "title" not in cols or "price" not in cols:
        raise ValueError("В первой строке должны быть столбцы «Название» и «Цена».")

    created = updated = 0
    errors = []
    cats = {c.name.lower(): c for c in BookCategory.objects.all()}
    for n, row in enumerate(rows[1:], start=2):
        if not any(cell.strip() for cell in row):
            continue

        def get(key):
            i = cols.get(key)
            return row[i].strip() if i is not None and i < len(row) else ""

        title, price = get("title"), _to_int(get("price"))
        if not title or not price:
            errors.append(f"Строка {n}: нет названия или цены — пропущена.")
            continue
        category = None
        if get("category"):
            key = get("category").lower()
            category = cats.get(key) or cats.setdefault(
                key, BookCategory.objects.create(name=get("category")[:60])
            )
        sku = get("sku")[:40]
        book = None
        if sku:
            book = Book.objects.filter(sku=sku).first()
        if book is None:
            book = Book.objects.filter(title__iexact=title, author=get("author")[:100]).first()
        data = {
            "title": title[:150], "author": get("author")[:100], "price": price,
            "old_price": _to_int(get("old_price")), "description": get("description")[:3000],
            "sku": sku, "category": category,
        }
        avail = get("available").lower()
        if avail:
            data["is_available"] = avail not in ("нет", "no", "0", "false", "-")
        if book:
            for k, v in data.items():
                if k in ("description", "category") and not v:
                    continue  # пустая ячейка не стирает уже заполненное
                setattr(book, k, v)
            book.save()
            updated += 1
        else:
            Book.objects.create(**data)
            created += 1
    return created, updated, errors


def _norm(name):
    return " ".join(name.lower().replace("_", " ").replace("-", " ").split())


def attach_book_photos(files):
    """Фото по имени файла: код (sku) или название книги. Возвращает (прикреплено, не найдено, ошибки)."""
    import os

    from django import forms as dj_forms

    by_sku = {b.sku.lower(): b for b in Book.objects.exclude(sku="")}
    by_title = {}
    for b in Book.objects.all():
        by_title.setdefault(_norm(b.title), b)
    matched, missing, errors = 0, [], []
    for f in files:
        stem = os.path.splitext(f.name)[0]
        book = by_sku.get(stem.lower().strip()) or by_title.get(_norm(stem))
        if book is None:
            missing.append(f.name)
            continue
        try:
            dj_forms.ImageField().clean(f)
            if f.size > 5 * 1024 * 1024:
                raise dj_forms.ValidationError("больше 5 МБ")
        except dj_forms.ValidationError as e:
            errors.append(f"{f.name}: {e.messages[0]}")
            continue
        book.image.save(os.path.basename(f.name), f, save=True)
        matched += 1
    return matched, missing, errors


@staff_member_required
def staff_books_import(request):
    result = {}
    if request.method == "POST":
        if request.POST.get("kind") == "csv" and request.FILES.get("file"):
            try:
                created, updated, errors = import_books_from_csv(request.FILES["file"].read())
                result["csv"] = {"created": created, "updated": updated, "errors": errors}
            except ValueError as e:
                result["csv_error"] = str(e)
        elif request.POST.get("kind") == "photos":
            files = request.FILES.getlist("photos")
            if files:
                matched, missing, errors = attach_book_photos(files)
                result["photos"] = {"matched": matched, "missing": missing, "errors": errors}
    return render(
        request,
        "shop/staff_books_import.html",
        {"result": result, "books_total": Book.objects.count(),
         "no_photo": Book.objects.filter(image="").count()},
    )


@staff_member_required
def staff_books_template(request):
    text = (
        "Название;Автор;Жанр;Цена;Старая цена;Код;В наличии;Описание\n"
        "Маленький принц;Антуан де Сент-Экзюпери;Классика;450;550;B-001;да;Философская сказка для детей и взрослых\n"
        "Атомные привычки;Джеймс Клир;Саморазвитие;890;;B-002;да;Как формировать полезные привычки\n"
    )
    resp = HttpResponse("\ufeff" + text, content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = 'attachment; filename="kaafi-books-template.csv"'
    return resp


# ---------- регистрация гостя на кассе ----------


def _digits(value):
    return re.sub(r"\D", "", value or "")


@staff_member_required
@require_POST
def staff_customer_register(request):
    """Бариста регистрирует постоянного гостя за 10 секунд. Пароль можно задать или получить временный —
    гость сам сменит его в профиле."""
    import secrets

    name = request.POST.get("name", "").strip()[:60]
    phone = _digits(request.POST.get("phone"))
    password = request.POST.get("password", "").strip()
    if not name:
        return JsonResponse({"error": "Укажите имя гостя."}, status=400)
    if not 9 <= len(phone) <= 15:
        return JsonResponse({"error": "Укажите корректный номер телефона."}, status=400)
    if Customer.objects.filter(phone=phone).exists():
        return JsonResponse({"error": "Этот номер уже зарегистрирован — найдите гостя поиском."}, status=409)
    if password and len(password) < 6:
        return JsonResponse({"error": "Пароль — не короче 6 символов (или оставьте пустым)."}, status=400)
    generated = not password
    if generated:
        password = secrets.token_urlsafe(6)
    c = Customer(name=name, phone=phone, code=Customer.new_code())
    c.set_password(password)
    c.save()
    data = _customer_json(c)
    data["password"] = password if generated else ""
    return JsonResponse({"customer": data}, status=201)


# ---------- настройки профиля гостя ----------


@require_POST
def account_settings(request):
    customer = _session_customer(request)
    if customer is None:
        return redirect("account")
    action = request.POST.get("action")
    if action == "name":
        name = request.POST.get("name", "").strip()[:60]
        if name:
            customer.name = name
            customer.save(update_fields=["name"])
            return redirect("/account/?saved=name")
        return redirect("/account/?error=name")
    if action == "password":
        old, new = request.POST.get("old", ""), request.POST.get("new", "")
        if not customer.check_password(old):
            return redirect("/account/?error=oldpass")
        if len(new) < 6:
            return redirect("/account/?error=newpass")
        customer.set_password(new)
        customer.save(update_fields=["password"])
        request.session.cycle_key()
        request.session[SESSION_CUSTOMER] = customer.pk
        return redirect("/account/?saved=password")
    return redirect("account")


# ---------- аккаунты персонала ----------


@staff_member_required
def staff_account(request):
    from django.contrib.auth import get_user_model, update_session_auth_hash
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError

    User = get_user_model()
    me = request.user
    msg = err = ""

    if request.method == "POST":
        action = request.POST.get("action")
        try:
            if action == "profile":
                username = request.POST.get("username", "").strip()
                if not username:
                    raise ValidationError("Логин не может быть пустым.")
                if User.objects.exclude(pk=me.pk).filter(username__iexact=username).exists():
                    raise ValidationError("Такой логин уже занят.")
                me.username = username
                me.first_name = request.POST.get("first_name", "").strip()[:60]
                me.save()
                msg = "Профиль сохранён."
            elif action == "password":
                if not me.check_password(request.POST.get("old", "")):
                    raise ValidationError("Текущий пароль указан неверно.")
                new = request.POST.get("new", "")
                if new != request.POST.get("new2", ""):
                    raise ValidationError("Новые пароли не совпадают.")
                validate_password(new, me)
                me.set_password(new)
                me.save()
                update_session_auth_hash(request, me)  # не выкидывать из панели после смены
                msg = "Пароль изменён."
            elif action in ("add_staff", "reset_staff", "toggle_staff") and not me.is_superuser:
                raise ValidationError("Это может делать только главный администратор.")
            elif action == "add_staff":
                username = request.POST.get("username", "").strip()
                password = request.POST.get("password", "")
                if not username:
                    raise ValidationError("Укажите логин сотрудника.")
                if User.objects.filter(username__iexact=username).exists():
                    raise ValidationError("Такой логин уже занят.")
                validate_password(password)
                u = User.objects.create_user(
                    username, password=password, is_staff=True, first_name=request.POST.get("first_name", "")[:60]
                )
                msg = f"Сотрудник «{u.username}» добавлен: ему доступны заказы, клиенты, книги и статистика."
            elif action == "reset_staff":
                u = get_object_or_404(User, pk=request.POST.get("id"), is_superuser=False, is_staff=True)
                password = request.POST.get("password", "")
                validate_password(password, u)
                u.set_password(password)
                u.save()
                msg = f"Пароль сотрудника «{u.username}» изменён."
            elif action == "toggle_staff":
                u = get_object_or_404(User, pk=request.POST.get("id"), is_superuser=False, is_staff=True)
                u.is_active = not u.is_active
                u.save(update_fields=["is_active"])
                msg = f"Сотрудник «{u.username}» {'включён' if u.is_active else 'отключён'}."
        except ValidationError as e:
            err = " ".join(e.messages)

    staff = User.objects.filter(is_staff=True, is_superuser=False).order_by("username") if me.is_superuser else []
    return render(request, "shop/staff_account.html", {"msg": msg, "err": err, "staff_users": staff, "me": me})


def staff_setup(request):
    """Первый запуск: создать администратора самому, без паролей из консоли. Доступно, пока нет ни одного
    администратора, и только с этого же компьютера."""
    from django.contrib.auth import get_user_model, login
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError

    User = get_user_model()
    if User.objects.filter(is_superuser=True).exists():
        raise Http404
    if request.META.get("REMOTE_ADDR") not in ("127.0.0.1", "::1") and not getattr(settings, "SETUP_ALLOW_REMOTE", False):
        return HttpResponse("Первичную настройку можно сделать только с компьютера, на котором запущен сайт.", status=403)
    err = ""
    if request.method == "POST":
        username = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")
        try:
            if not username:
                raise ValidationError("Придумайте логин.")
            if password != request.POST.get("password2", ""):
                raise ValidationError("Пароли не совпадают.")
            validate_password(password)
            user = User.objects.create_superuser(username, "", password)
            login(request, user, backend="django.contrib.auth.backends.ModelBackend")
            return redirect("admin:index")
        except ValidationError as e:
            err = " ".join(e.messages)
    return render(request, "shop/staff_setup.html", {"err": err})
