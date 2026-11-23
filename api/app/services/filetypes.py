"""Detect a file's real type from its first bytes (magic numbers), never from its name."""

from dataclasses import dataclass


@dataclass(frozen=True)
class FileKind:
    mime: str
    ext: str


PDF = FileKind("application/pdf", "pdf")
JPEG = FileKind("image/jpeg", "jpg")
PNG = FileKind("image/png", "png")
WEBP = FileKind("image/webp", "webp")
HEIC = FileKind("image/heic", "heic")

# ISO-BMFF brands used by HEIC/HEIF photos (iPhone and most Android cameras).
_HEIF_BRANDS = {b"heic", b"heix", b"hevc", b"hevx", b"heim", b"heis", b"mif1", b"msf1"}

# How many leading bytes `sniff` needs.
HEADER_SIZE = 16


def sniff(head: bytes) -> FileKind | None:
    """Return the detected kind for an allowed type, or None if not allowed/unknown."""
    if head.startswith(b"%PDF-"):
        return PDF
    if head.startswith(b"\xff\xd8\xff"):
        return JPEG
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return PNG
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return WEBP
    if head[4:8] == b"ftyp" and head[8:12] in _HEIF_BRANDS:
        return HEIC
    return None
