import json

from django.conf import settings
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_POST

from .models import Book, PurchaseOrder
from .razorpay_client import create_order, razorpay_configured, verify_payment_signature


def _json_body(request):
    if request.content_type and "application/json" in request.content_type:
        try:
            return json.loads(request.body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            return {}
    return request.POST


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

    if product_type == PurchaseOrder.ONLINE and not book.has_reader:
        return JsonResponse(
            {"ok": False, "error": "Online reading is not available for this book."},
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
    except Exception:
        return JsonResponse(
            {"ok": False, "error": "Could not start checkout. Please try again."},
            status=502,
        )

    order = PurchaseOrder.objects.create(
        book=book,
        product_type=product_type,
        amount_paise=amount_paise,
        currency="INR",
        status=PurchaseOrder.CREATED,
        razorpay_order_id=rz_order["id"],
    )

    display_amount = f"₹{amount_paise // 100}"
    if amount_paise % 100:
        display_amount = f"₹{amount_paise / 100:.2f}"

    return JsonResponse(
        {
            "ok": True,
            "key": settings.RAZORPAY_KEY_ID,
            "order_id": order.razorpay_order_id,
            "amount": amount_paise,
            "currency": "INR",
            "name": "author.thinks",
            "description": f"{book.title} — {order.get_product_type_display()}",
            "prefill": {},
            "theme": {"color": "#2C2A27"},
            "display_amount": display_amount,
            "book_slug": book.slug,
            "product_type": product_type,
        }
    )


@require_POST
def verify_payment(request):
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

    order = (
        PurchaseOrder.objects.select_related("book")
        .filter(razorpay_order_id=order_id)
        .first()
    )
    if not order:
        return JsonResponse({"ok": False, "error": "Order not found."}, status=404)

    if order.status == PurchaseOrder.PAID:
        return JsonResponse(
            {
                "ok": True,
                "message": "Payment already confirmed.",
                "product_type": order.product_type,
                "book_slug": order.book.slug,
            }
        )

    if not verify_payment_signature(
        razorpay_order_id=order_id,
        razorpay_payment_id=payment_id,
        razorpay_signature=signature,
    ):
        order.status = PurchaseOrder.FAILED
        order.save(update_fields=["status"])
        return JsonResponse(
            {"ok": False, "error": "Payment verification failed."},
            status=400,
        )

    order.status = PurchaseOrder.PAID
    order.razorpay_payment_id = payment_id
    order.razorpay_signature = signature
    order.paid_at = timezone.now()
    order.buyer_email = (data.get("email") or "").strip()[:254]
    order.buyer_contact = (data.get("contact") or "").strip()[:20]
    order.save(
        update_fields=[
            "status",
            "razorpay_payment_id",
            "razorpay_signature",
            "paid_at",
            "buyer_email",
            "buyer_contact",
        ]
    )

    if order.product_type == PurchaseOrder.ONLINE:
        message = "Payment successful — enjoy reading."
    else:
        message = (
            "Payment successful — thank you. "
            "Your download will be shared by email shortly."
        )

    return JsonResponse(
        {
            "ok": True,
            "message": message,
            "product_type": order.product_type,
            "book_slug": order.book.slug,
            "payment_id": payment_id,
        }
    )
