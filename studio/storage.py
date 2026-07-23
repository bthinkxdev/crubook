from pathlib import Path

from django.conf import settings
from django.core.files.storage import FileSystemStorage


class PrivateMediaStorage(FileSystemStorage):
    """Files stored outside public MEDIA_URL — served only via tokenized download."""

    def __init__(self, **kwargs):
        kwargs.setdefault("location", str(Path(settings.PRIVATE_MEDIA_ROOT)))
        kwargs.setdefault("base_url", None)
        super().__init__(**kwargs)

    def url(self, name):
        # No public URL — access only through purchase download endpoint.
        return ""
