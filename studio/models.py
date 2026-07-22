from django.db import models


class ContactMessage(models.Model):
    THOUGHT = "thought"
    INQUIRY = "inquiry"
    KIND_CHOICES = [
        (THOUGHT, "Thought"),
        (INQUIRY, "Inquiry"),
    ]

    name = models.CharField(max_length=120)
    email = models.EmailField()
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=INQUIRY)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} · {self.get_kind_display()} · {self.created_at:%Y-%m-%d}"
