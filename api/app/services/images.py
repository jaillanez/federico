"""Project photo processing: fix EXIF orientation, drop ALL metadata (GPS included) and
encode AVIF + WebP at 400/800/1600/2400 px wide (never upscaled)."""

import io
from dataclasses import dataclass

from PIL import Image, ImageOps

from app.services.filetypes import JPEG, PNG, WEBP, FileKind, sniff
from app.services.media import available_widths

# Reject decompression bombs (a ~50 MP photo is already huge for the web).
Image.MAX_IMAGE_PIXELS = 60_000_000

ACCEPTED: tuple[FileKind, ...] = (JPEG, PNG, WEBP)


class ImageError(ValueError):
    """The upload is not an image we can process."""


@dataclass
class Variant:
    width: int
    ext: str
    mime: str
    data: bytes


@dataclass
class Processed:
    width: int
    height: int
    variants: list[Variant]


def _clean(img: Image.Image) -> Image.Image:
    img = ImageOps.exif_transpose(img)  # bake the orientation into the pixels
    mode = "RGBA" if img.mode in ("RGBA", "LA") or "transparency" in img.info else "RGB"
    out = img.convert(mode)
    out.info = {}  # drop EXIF, XMP, ICC, comments...
    return out


def _encode(img: Image.Image, fmt: str) -> bytes:
    buf = io.BytesIO()
    if fmt == "avif":
        img.save(buf, "AVIF", quality=55, speed=6, exif=b"", xmp=b"")
    else:
        img.save(buf, "WEBP", quality=80, method=4, exif=b"", xmp=b"")
    return buf.getvalue()


def process(data: bytes, widths: tuple[int, ...] | None = None) -> Processed:
    kind = sniff(data[:16])
    if kind not in ACCEPTED:
        raise ImageError("Solo se aceptan fotos JPG, PNG o WebP.")
    try:
        with Image.open(io.BytesIO(data)) as raw:
            raw.load()
            img = _clean(raw)
    except (OSError, Image.DecompressionBombError) as exc:
        raise ImageError("No pudimos leer la imagen.") from exc
    w, h = img.size
    variants: list[Variant] = []
    for target in widths or tuple(available_widths(w)):
        size = (target, max(1, round(h * target / w))) if target < w else (w, h)
        resized = img if size == (w, h) else img.resize(size, Image.Resampling.LANCZOS)
        for ext, mime in (("avif", "image/avif"), ("webp", "image/webp")):
            variants.append(Variant(target, ext, mime, _encode(resized, ext)))
    return Processed(w, h, variants)
