from django.urls import path

from .views import (
    AboutView,
    BookDetailView,
    BookLegacyRedirectView,
    BooksView,
    HomeView,
    ReaderView,
    contact_submit,
)
from .views_payments import (
    access_status,
    create_payment_order,
    download_purchased_pdf,
    verify_payment,
)

urlpatterns = [
    path("", HomeView.as_view(), name="home"),
    path("books/", BooksView.as_view(), name="books"),
    path("books/<slug:slug>/", BookDetailView.as_view(), name="book_detail"),
    path("book/", BookLegacyRedirectView.as_view(), name="book"),
    path("about/", AboutView.as_view(), name="about"),
    path("reader/", ReaderView.as_view(), name="reader"),
    path("contact/", contact_submit, name="contact"),
    path("payments/create-order/", create_payment_order, name="payment_create_order"),
    path("payments/verify/", verify_payment, name="payment_verify"),
    path(
        "payments/download/<uuid:token>/",
        download_purchased_pdf,
        name="payment_download",
    ),
    path(
        "payments/access/<uuid:token>/",
        access_status,
        name="payment_access",
    ),
]
