from django.db import models
from django.urls import reverse
from django.utils.text import slugify


class Book(models.Model):
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    blurb = models.CharField(
        max_length=200,
        help_text="Short line shown on cards.",
    )
    description = models.TextField(
        help_text="Longer description for the listing and product page.",
    )
    lead = models.CharField(
        max_length=300,
        blank=True,
        help_text="Optional subtitle under the title on the book page.",
    )
    cover = models.ImageField(upload_to="books/covers/")
    price = models.CharField(
        max_length=40,
        help_text='Display price, e.g. "₹99".',
    )
    online_price = models.CharField(
        max_length=40,
        blank=True,
        default="₹49",
        help_text='Read-online price, e.g. "₹49". Leave blank to hide.',
    )
    read_time = models.CharField(
        max_length=60,
        help_text='e.g. "2 hrs read".',
    )
    edition = models.CharField(
        max_length=120,
        blank=True,
        help_text='e.g. "First Edition, 2026" or "Coming soon".',
    )
    is_available = models.BooleanField(
        default=True,
        help_text="Uncheck for Coming Soon books.",
    )
    is_featured = models.BooleanField(
        default=True,
        help_text="Show on the homepage carousel.",
    )
    has_reader = models.BooleanField(
        default=False,
        help_text="Show the Read Online button (uses the shared reader page).",
    )
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "title"]

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.title) or "book"
            slug = base
            n = 2
            while Book.objects.filter(slug=slug).exclude(pk=self.pk).exists():
                slug = f"{base}-{n}"
                n += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse("book_detail", kwargs={"slug": self.slug})


class Chapter(models.Model):
    book = models.ForeignKey(Book, related_name="chapters", on_delete=models.CASCADE)
    label = models.CharField(
        max_length=80,
        help_text='e.g. "Chapter One".',
    )
    title = models.CharField(max_length=200)
    summary = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"{self.label}: {self.title}"


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
