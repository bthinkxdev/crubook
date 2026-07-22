from django.http import JsonResponse
from django.shortcuts import redirect
from django.views.decorators.http import require_POST
from django.views.generic import TemplateView

from .data import BOOKS
from .models import ContactMessage


class HomeView(TemplateView):
    template_name = "studio/home.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["active_tab"] = "home"
        ctx["books"] = BOOKS
        return ctx


class BooksView(TemplateView):
    template_name = "studio/books.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["active_tab"] = "books"
        ctx["books"] = BOOKS
        return ctx


class BookView(TemplateView):
    template_name = "studio/book.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["active_tab"] = "books"
        ctx["book"] = BOOKS[0]
        return ctx


class AboutView(TemplateView):
    template_name = "studio/about.html"

    def get_context_data(self, **kwargs):
        ctx = super().get_context_data(**kwargs)
        ctx["active_tab"] = "about"
        return ctx


class ReaderView(TemplateView):
    template_name = "studio/reader.html"


@require_POST
def contact_submit(request):
    name = (request.POST.get("name") or "").strip()
    email = (request.POST.get("email") or "").strip()
    kind = (request.POST.get("kind") or ContactMessage.INQUIRY).strip()
    message = (request.POST.get("message") or "").strip()

    wants_json = "application/json" in (request.headers.get("Accept") or "")

    valid_kinds = {ContactMessage.THOUGHT, ContactMessage.INQUIRY}
    if kind not in valid_kinds:
        kind = ContactMessage.INQUIRY

    errors = {}
    if not name:
        errors["name"] = "Please share your name."
    if not email or "@" not in email:
        errors["email"] = "Please enter a valid email."
    if len(message) < 10:
        errors["message"] = "Please write a little more (at least 10 characters)."

    if errors:
        if wants_json:
            return JsonResponse({"ok": False, "errors": errors}, status=400)
        return redirect(request.META.get("HTTP_REFERER") or "/")

    ContactMessage.objects.create(
        name=name,
        email=email,
        kind=kind,
        message=message,
    )

    if wants_json:
        return JsonResponse(
            {
                "ok": True,
                "message": "Thank you — your note reached the studio.",
            }
        )

    return redirect(request.META.get("HTTP_REFERER") or "/")
