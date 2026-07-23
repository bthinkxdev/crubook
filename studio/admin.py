from django.contrib import admin
from django.utils.html import format_html

from .models import Book, Chapter, ContactMessage, PurchaseOrder


class ChapterInline(admin.TabularInline):
    model = Chapter
    extra = 1
    fields = ("sort_order", "label", "title", "summary")


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = (
        "cover_thumb",
        "title",
        "price",
        "price_paise",
        "has_pdf",
        "is_available",
        "is_featured",
        "has_reader",
        "sort_order",
    )
    list_display_links = ("cover_thumb", "title")
    list_editable = ("is_available", "is_featured", "has_reader", "sort_order")
    list_filter = ("is_available", "is_featured", "has_reader")
    search_fields = ("title", "blurb", "description")
    prepopulated_fields = {"slug": ("title",)}
    readonly_fields = ("created_at", "updated_at")
    inlines = [ChapterInline]
    fieldsets = (
        (
            "Basics",
            {
                "fields": (
                    "title",
                    "slug",
                    "blurb",
                    "description",
                    "lead",
                    "cover",
                    "pdf",
                )
            },
        ),
        (
            "Pricing & meta",
            {
                "fields": (
                    "price",
                    "price_paise",
                    "online_price",
                    "online_price_paise",
                    "read_time",
                    "edition",
                )
            },
        ),
        (
            "Visibility",
            {
                "fields": (
                    "is_available",
                    "is_featured",
                    "has_reader",
                    "sort_order",
                )
            },
        ),
        (
            "Timestamps",
            {
                "classes": ("collapse",),
                "fields": ("created_at", "updated_at"),
            },
        ),
    )

    @admin.display(description="Cover")
    def cover_thumb(self, obj):
        if not obj.cover:
            return "—"
        return format_html(
            '<img src="{}" alt="" style="height:48px;width:34px;object-fit:cover;border-radius:6px;" />',
            obj.cover.url,
        )

    @admin.display(description="PDF", boolean=True)
    def has_pdf(self, obj):
        return obj.has_pdf


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = (
        "razorpay_order_id",
        "book",
        "product_type",
        "amount_display",
        "status",
        "buyer_email",
        "email_sent_at",
        "created_at",
        "paid_at",
    )
    list_filter = ("status", "product_type", "created_at")
    search_fields = (
        "razorpay_order_id",
        "razorpay_payment_id",
        "buyer_email",
        "book__title",
        "download_token",
    )
    readonly_fields = (
        "book",
        "product_type",
        "amount_paise",
        "currency",
        "status",
        "razorpay_order_id",
        "razorpay_payment_id",
        "razorpay_signature",
        "buyer_email",
        "buyer_contact",
        "download_token",
        "email_sent_at",
        "created_at",
        "paid_at",
    )

    @admin.display(description="Amount")
    def amount_display(self, obj):
        return f"₹{obj.amount_paise / 100:.2f}"


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "kind", "created_at")
    list_filter = ("kind", "created_at")
    search_fields = ("name", "email", "message")
    readonly_fields = ("created_at",)
