from django.urls import path

from .views import AboutView, BookView, BooksView, HomeView, ReaderView, contact_submit

urlpatterns = [
    path("", HomeView.as_view(), name="home"),
    path("books/", BooksView.as_view(), name="books"),
    path("book/", BookView.as_view(), name="book"),
    path("about/", AboutView.as_view(), name="about"),
    path("reader/", ReaderView.as_view(), name="reader"),
    path("contact/", contact_submit, name="contact"),
]
