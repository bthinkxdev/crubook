import json
import logging
import uuid
from pathlib import Path

from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import FileResponse, Http404, JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from .fulfillment import absolute_download_url, send_purchase_pdf_email
from .models import Book, PurchaseOrder
from .razorpay_client import (
    create_order,
    fetch_payment,
    razorpay_configured,
    verify_payment_signature,
)

logger = logging.getLogger(__name__)

# Captured / authorized are acceptable paid states from Razorpay.
_PAID_RZ_STATUSES = frozenset({"captured", "authorized"})


def _json_body(request):
    if request.content_type and "application/json" in request.content_type:
        try:
            return json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return {}
    return request.POST


def _success_payload(request, order, *, message: str, payment_id: str = ""):
    payload = {
        "ok": True,
        "message": message,
        "product_type": order.product_type,
        "book_slug": order.book.slug,
        "payment_id": payment_id or order.razorpay_payment_id,
        "access_token": str(order.download_token) if order.download_token else None,
        "download_url": None,
        "email_sent": False,
    }

    if (
        order.product_type == PurchaseOrder.DOWNLOAD
        and order.download_token
        and order.book.has_pdf
    ):
        payload["download_url"] = absolute_download_url(request, order.download_token)

        if (
            getattr(settings, "PURCHASE_EMAIL_ENABLED", False)
            and order.buyer_email
            and not order.email_sent_at
        ):
            try:
                sent = send_purchase_pdf_email(
                    order=order,
                    download_url=payload["download_url"],
                )
                if sent:
                    order.email_sent_at = timezone.now()
                    order.save(update_fields=["email_sent_at"])
                    payload["email_sent"] = True
            except Exception:
                logger.exception("Failed to email PDF for order %s", order.pk)
        elif order.email_sent_at:
            payload["email_sent"] = True

    return payload


def _ensure_access_token(order: PurchaseOrder) -> None:
    if not order.download_token:
        order.download_token = uuid.uuid4()


def _assert_razorpay_payment_matches(order: PurchaseOrder, payment_id: str) -> dict:
    """
    Confirm the payment entity on Razorpay matches this order (amount + order id + status).
    Returns the payment dict. Raises ValueError on mismatch.
    """
    payment = fetch_payment(payment_id)
    status = (payment.get("status") or "").lower()
    if status not in _PAID_RZ_STATUSES:
        raise ValueError(f"Payment not completed (status={status}).")

    rz_order_id = payment.get("order_id") or ""
    if rz_order_id and rz_order_id != order.razorpay_order_id:
        raise ValueError("Payment does not belong to this order.")

    try:
        paid_amount = int(payment.get("amount") or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid payment amount.") from exc

    if paid_amount != int(order.amount_paise):
        raise ValueError("Payment amount does not match order.")

    return payment


@require_POST
def create_payment_order(request):
    if not razorpay_configured():
        return JsonResponse(
            {
                "ok": False,
                "error": "Payments are not configured yet. Add Razorpay keys on the server.",
            },
            status=503,
        )

    data = _json_body(request)
    slug = (data.get("book_slug") or "").strip()
    product_type = (data.get("product_type") or PurchaseOrder.DOWNLOAD).strip()
    buyer_email = (data.get("email") or "").strip()[:254]

    if product_type not in {PurchaseOrder.DOWNLOAD, PurchaseOrder.ONLINE}:
        product_type = PurchaseOrder.DOWNLOAD

    book = Book.objects.filter(slug=slug).first()
    if not book:
        return JsonResponse({"ok": False, "error": "Book not found."}, status=404)

    if product_type == PurchaseOrder.DOWNLOAD and not book.is_available:
        return JsonResponse(
            {"ok": False, "error": "This book is not available for purchase yet."},
            status=400,
        )

    if product_type == PurchaseOrder.DOWNLOAD and not book.has_pdf:
        return JsonResponse(
            {
                "ok": False,
                "error": "This book PDF is not ready yet. Please try again later.",
            },
            status=400,
        )

    if product_type == PurchaseOrder.ONLINE and not book.has_reader:
        return JsonResponse(
            {"ok": False, "error": "Online reading is not available for this book."},
            status=400,
        )

    if product_type == PurchaseOrder.ONLINE and book.amount_paise_for(product_type) < 100:
        return JsonResponse(
            {"ok": False, "error": "Online price is not configured in admin."},
            status=400,
        )

    amount_paise = book.amount_paise_for(product_type)
    if amount_paise < 100:
        return JsonResponse(
            {"ok": False, "error": "Invalid book price. Set price in paise in admin."},
            status=400,
        )

    try:
        rz_order = create_order(
            amount_paise=amount_paise,
            currency="INR",
            notes={
                "book_slug": book.slug,
                "product_type": product_type,
            },
        )
        rz_order_id = rz_order["id"]
    except Exception:
        logger.exception("Razorpay order create failed for book=%s", book.slug)
        return JsonResponse(
            {"ok": False, "error": "Could not start checkout. Please try again."},
            status=502,
        )

    try:
        with transaction.atomic():
            order = PurchaseOrder.objects.create(
                book=book,
                product_type=product_type,
                amount_paise=amount_paise,
                currency="INR",
                status=PurchaseOrder.CREATED,
                razorpay_order_id=rz_order_id,
                buyer_email=buyer_email,
            )
    except IntegrityError:
        logger.exception("Duplicate Razorpay order id %s", rz_order_id)
        return JsonResponse(
            {"ok": False, "error": "Could not start checkout. Please try again."},
            status=502,
        )

    display_amount = f"₹{amount_paise // 100}"
    if amount_paise % 100:
        display_amount = f"₹{amount_paise / 100:.2f}"

    prefill = {}
    if buyer_email:
        prefill["email"] = buyer_email

    return JsonResponse(
        {
            "ok": True,
            "key": settings.RAZORPAY_KEY_ID,
            "order_id": order.razorpay_order_id,
            "amount": amount_paise,
            "currency": "INR",
            "name": "author.thinks",
            "description": f"{book.title} — {order.get_product_type_display()}",
            "prefill": prefill,
            "theme": {"color": "#2C2A27"},
            "display_amount": display_amount,
            "book_slug": book.slug,
            "product_type": product_type,
        }
    )


@require_POST
def verify_payment(request):
    """
    Idempotent, transactional payment confirmation.

    - Signature verified before any status change
    - Row locked with select_for_update
    - Same payment_id retry returns success (ACID-safe)
    - Amount / order_id cross-checked against Razorpay payment entity
    """
    if not razorpay_configured():
        return JsonResponse(
            {"ok": False, "error": "Payments are not configured."},
            status=503,
        )

    data = _json_body(request)
    order_id = (data.get("razorpay_order_id") or "").strip()
    payment_id = (data.get("razorpay_payment_id") or "").strip()
    signature = (data.get("razorpay_signature") or "").strip()

    if not (order_id and payment_id and signature):
        return JsonResponse(
            {"ok": False, "error": "Missing payment details."},
            status=400,
        )

    # Cryptographic check before touching DB state.
    if not verify_payment_signature(
        razorpay_order_id=order_id,
        razorpay_payment_id=payment_id,
        razorpay_signature=signature,
    ):
        return JsonResponse(
            {"ok": False, "error": "Payment verification failed."},
            status=400,
        )

    try:
        with transaction.atomic():
            try:
                order = (
                    PurchaseOrder.objects.select_for_update()
                    .select_related("book")
                    .get(razorpay_order_id=order_id)
                )
            except PurchaseOrder.DoesNotExist:
                return JsonResponse(
                    {"ok": False, "error": "Order not found."},
                    status=404,
                )

            # Idempotent success: already paid with this payment.
            if order.status == PurchaseOrder.PAID:
                if order.razorpay_payment_id and order.razorpay_payment_id != payment_id:
                    return JsonResponse(
                        {
                            "ok": False,
                            "error": "This order was already paid with a different payment.",
                        },
                        status=409,
                    )
                _ensure_access_token(order)
                if order.razorpay_payment_id != payment_id or not order.download_token:
                    order.razorpay_payment_id = payment_id
                    order.razorpay_signature = signature
                    order.save(
                        update_fields=[
                            "razorpay_payment_id",
                            "razorpay_signature",
                            "download_token",
                        ]
                    )
                message = (
                    "Payment already confirmed — enjoy reading."
                    if order.product_type == PurchaseOrder.ONLINE
                    else "Payment already confirmed — preparing your download."
                )
                return JsonResponse(
                    _success_payload(
                        request,
                        order,
                        message=message,
                        payment_id=payment_id,
                    )
                )

            # Reject re-use of a payment id on another order.
            conflict = (
                PurchaseOrder.objects.select_for_update()
                .filter(razorpay_payment_id=payment_id)
                .exclude(pk=order.pk)
                .exists()
            )
            if conflict:
                return JsonResponse(
                    {"ok": False, "error": "Payment already used."},
                    status=409,
                )

            try:
                payment = _assert_razorpay_payment_matches(order, payment_id)
            except Exception as exc:
                logger.warning(
                    "Razorpay payment match failed order=%s payment=%s: %s",
                    order_id,
                    payment_id,
                    exc,
                )
                return JsonResponse(
                    {
                        "ok": False,
                        "error": "Payment could not be confirmed with the gateway. Please retry.",
                    },
                    status=400,
                )

            buyer_email = (data.get("email") or order.buyer_email or "").strip()[:254]
            buyer_contact = (data.get("contact") or "").strip()[:20]
            buyer_email = buyer_email or (payment.get("email") or "").strip()[:254]
            buyer_contact = buyer_contact or str(payment.get("contact") or "")[:20]

            _ensure_access_token(order)
            order.status = PurchaseOrder.PAID
            order.razorpay_payment_id = payment_id
            order.razorpay_signature = signature
            order.paid_at = timezone.now()
            order.buyer_email = buyer_email
            order.buyer_contact = buyer_contact
            order.save(
                update_fields=[
                    "status",
                    "razorpay_payment_id",
                    "razorpay_signature",
                    "paid_at",
                    "buyer_email",
                    "buyer_contact",
                    "download_token",
                ]
            )

            if order.product_type == PurchaseOrder.ONLINE:
                message = "Payment successful — preparing your reader access."
            else:
                message = "Payment successful — preparing your download."

            return JsonResponse(
                _success_payload(
                    request,
                    order,
                    message=message,
                    payment_id=payment_id,
                )
            )
    except IntegrityError:
        logger.exception("Integrity error verifying payment %s", payment_id)
        # Likely concurrent verify with same payment_id — treat as retryable/idempotent.
        order = (
            PurchaseOrder.objects.select_related("book")
            .filter(razorpay_order_id=order_id, status=PurchaseOrder.PAID)
            .first()
        )
        if order and (
            not order.razorpay_payment_id or order.razorpay_payment_id == payment_id
        ):
            return JsonResponse(
                _success_payload(
                    request,
                    order,
                    message="Payment already confirmed.",
                    payment_id=payment_id,
                )
            )
        return JsonResponse(
            {"ok": False, "error": "Could not finalize payment. Please retry verify."},
            status=409,
        )


@require_GET
def download_purchased_pdf(request, token):
    order = (
        PurchaseOrder.objects.select_related("book")
        .filter(
            download_token=token,
            status=PurchaseOrder.PAID,
            product_type=PurchaseOrder.DOWNLOAD,
        )
        .first()
    )
    if not order or not order.book.has_pdf:
        raise Http404("Download not found.")

    pdf = order.book.pdf
    filename = Path(pdf.name).name or f"{order.book.slug}.pdf"
    try:
        pdf.open("rb")
    except Exception as exc:
        raise Http404("File missing.") from exc

    response = FileResponse(pdf, as_attachment=True, filename=filename)
    response["Content-Type"] = "application/pdf"
    response["Cache-Control"] = "no-store"
    response["X-Content-Type-Options"] = "nosniff"
    return response


@require_GET
def access_status(request, token):
    """Validate a paid access token (used by the online reader)."""
    order = (
        PurchaseOrder.objects.select_related("book")
        .filter(download_token=token, status=PurchaseOrder.PAID)
        .first()
    )
    if not order:
        return JsonResponse({"ok": False, "error": "Invalid access."}, status=404)

    return JsonResponse(
        {
            "ok": True,
            "product_type": order.product_type,
            "book_slug": order.book.slug,
            "has_reader": order.book.has_reader,
        }
    )
