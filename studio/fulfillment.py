import logging
from pathlib import Path

from django.conf import settings
from django.core.mail import EmailMessage
from django.urls import reverse

logger = logging.getLogger(__name__)


def email_configured() -> bool:
    return bool(settings.EMAIL_HOST and settings.DEFAULT_FROM_EMAIL)


def send_purchase_pdf_email(*, order, download_url: str) -> bool:
    """
    Email the purchased PDF to the buyer.
    Returns True if send was attempted successfully.
    """
    if order.product_type != order.DOWNLOAD:
        return False
    if not order.buyer_email:
        return False
    if not order.book.pdf:
        return False
    if not email_configured():
        logger.warning("EMAIL_HOST / DEFAULT_FROM_EMAIL not set — skipping PDF email.")
        return False

    book = order.book
    subject = f"Your book — {book.title} · author.thinks"
    body = (
        f"Thank you for your purchase.\n\n"
        f"Book: {book.title}\n\n"
        f"Your PDF is attached to this email.\n"
        f"You can also download it here:\n{download_url}\n\n"
        f"— author.thinks\n"
    )

    email = EmailMessage(
        subject=subject,
        body=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[order.buyer_email],
    )

    pdf_field = book.pdf
    filename = Path(pdf_field.name).name or f"{book.slug}.pdf"
    try:
        pdf_field.open("rb")
        email.attach(filename, pdf_field.read(), "application/pdf")
    finally:
        pdf_field.close()

    email.send(fail_silently=False)
    return True


def absolute_download_url(request, token) -> str:
    path = reverse("payment_download", kwargs={"token": str(token)})
    return request.build_absolute_uri(path)
