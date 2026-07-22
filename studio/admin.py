from django.contrib import admin

from .models import ContactMessage


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "kind", "created_at")
    list_filter = ("kind", "created_at")
    search_fields = ("name", "email", "message")
    readonly_fields = ("created_at",)
