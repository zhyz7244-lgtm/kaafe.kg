from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path

from shop import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", views.home, name="home"),
    path("t/<uuid:token>/", views.table_entry, name="table_entry"),
    path("order/", views.order_create, name="order_create"),
    path("order/<int:pk>/status/", views.order_status, name="order_status"),
    path("reviews/", views.review_create, name="review_create"),
    path("books/", views.books, name="books"),
    path("books/order/", views.book_order_create, name="book_order_create"),
    path("books/<int:pk>/", views.book_detail, name="book_detail"),
    path("staff/books/import/", views.staff_books_import, name="staff_books_import"),
    path("staff/books/template.csv", views.staff_books_template, name="staff_books_template"),
    path("account/", views.account, name="account"),
    path("account/register/", views.account_register, name="account_register"),
    path("account/login/", views.account_login, name="account_login"),
    path("account/settings/", views.account_settings, name="account_settings"),
    path("account/logout/", views.account_logout, name="account_logout"),
    path("account/qr.png", views.account_qr, name="account_qr"),
    path("staff/customers/", views.staff_customers, name="staff_customers"),
    path("staff/customers/lookup/", views.staff_customers_lookup, name="staff_customers_lookup"),
    path("staff/customers/register/", views.staff_customer_register, name="staff_customer_register"),
    path("staff/customers/<int:pk>/bonus/", views.staff_customer_bonus, name="staff_customer_bonus"),
    path("staff/notifications/", views.staff_notifications, name="staff_notifications"),
    path("staff/notifications/save/", views.staff_notifications_save, name="staff_notifications_save"),
    path("staff/notifications/<str:action>/", views.staff_notifications_action, name="staff_notifications_action"),
    path("staff/account/", views.staff_account, name="staff_account"),
    path("staff/setup/", views.staff_setup, name="staff_setup"),
    path("staff/stats/", views.staff_stats, name="staff_stats"),
    path("staff/orders/", views.staff_orders, name="staff_orders"),
    path("staff/orders/feed/", views.staff_orders_feed, name="staff_orders_feed"),
    path("staff/orders/<int:pk>/status/", views.staff_order_status, name="staff_order_status"),
    path("staff/books/<int:pk>/status/", views.staff_book_status, name="staff_book_status"),
    path("staff/qr/", views.staff_qr_print, name="staff_qr_print"),
    path("staff/qr/<int:pk>.png", views.staff_qr_image, name="staff_qr_image"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
