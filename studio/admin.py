from django.contrib import admin
from django.utils.html import format_html

from .models import Book, Chapter, ContactMessage


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
                )
            },
        ),
        (
            "Pricing & meta",
            {
                "fields": (
                    "price",
                    "online_price",
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


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "kind", "created_at")
    list_filter = ("kind", "created_at")
    search_fields = ("name", "email", "message")
    readonly_fields = ("created_at",)
