from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand

from studio.models import Book, Chapter


SEED = [
    {
        "slug": "questioning-the-marriage-system",
        "title": "Questioning the Marriage System",
        "blurb": "Rethinking tradition, equality & freedom.",
        "description": (
            "A quiet, honest exploration of the traditions, roles, and "
            "expectations many of us inherit without ever choosing."
        ),
        "lead": "Rethinking tradition, equality, and the freedom to choose — written by Veena J V.",
        "cover_src": "images/book-cover.jpg",
        "price": "₹99",
        "online_price": "₹49",
        "read_time": "2 hrs read",
        "edition": "First Edition, 2026",
        "is_available": True,
        "is_featured": True,
        "has_reader": True,
        "sort_order": 0,
        "chapters": [
            {
                "label": "Chapter One",
                "title": "Why I Wrote This Book",
                "summary": (
                    "The personal moment that turned quiet discomfort into "
                    "questions no one around her was willing to ask."
                ),
            },
            {
                "label": "Chapter Two",
                "title": "The Roles We Inherit",
                "summary": (
                    "How daughters are taught to care for everyone else, "
                    "long before they're taught to care for themselves."
                ),
            },
            {
                "label": "Chapter Three",
                "title": "What Is Marriage?",
                "summary": (
                    "Separating love and partnership from the expectations "
                    "society quietly attaches to them."
                ),
            },
            {
                "label": "Chapter Four",
                "title": "What Needs to Change",
                "summary": (
                    "Practical, gentle shifts for building relationships on "
                    "conversation instead of assumption."
                ),
            },
            {
                "label": "Chapter Five",
                "title": "Before You Close This Book",
                "summary": (
                    "A closing letter that asks you one last question — not "
                    "about marriage, but about the dream you haven't buried yet."
                ),
            },
        ],
    },
    {
        "slug": "letters-to-my-younger-self",
        "title": "Letters to My Younger Self",
        "blurb": "A gentle guide to healing & growing.",
        "description": (
            "Letters written for the younger self — soft guidance for anyone "
            "learning to grow without abandoning who they were."
        ),
        "lead": "Soft guidance for anyone learning to grow without abandoning who they were.",
        "cover_src": "images/book-cover-02.jpg",
        "price": "₹149",
        "online_price": "",
        "read_time": "3 hrs read",
        "edition": "Coming soon",
        "is_available": False,
        "is_featured": True,
        "has_reader": False,
        "sort_order": 1,
        "chapters": [],
    },
]


class Command(BaseCommand):
    help = "Seed the two existing author.thinks books into the database."

    def handle(self, *args, **options):
        static_root = Path(settings.BASE_DIR) / "static"
        created = 0
        updated = 0

        for item in SEED:
            chapters = item.pop("chapters")
            cover_src = item.pop("cover_src")
            book, was_created = Book.objects.update_or_create(
                slug=item["slug"],
                defaults={k: v for k, v in item.items() if k != "slug"},
            )
            if was_created:
                created += 1
            else:
                updated += 1

            src = static_root / cover_src
            if src.exists() and (was_created or not book.cover):
                with src.open("rb") as fh:
                    book.cover.save(src.name, File(fh), save=True)

            if chapters and not book.chapters.exists():
                Chapter.objects.bulk_create(
                    [
                        Chapter(
                            book=book,
                            label=ch["label"],
                            title=ch["title"],
                            summary=ch["summary"],
                            sort_order=i,
                        )
                        for i, ch in enumerate(chapters)
                    ]
                )

            item["chapters"] = chapters
            item["cover_src"] = cover_src

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded books — created {created}, updated {updated}."
            )
        )
