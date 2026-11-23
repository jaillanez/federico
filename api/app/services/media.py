"""Public URLs for processed project images.

An image's ``storage_key`` is the prefix ``projects/{project_id}/{image_id}``; the processor
(phase 4) writes ``{storage_key}-{width}.{avif|webp}`` for each width up to the original.
"""

from app.config import get_settings
from app.models import ProjectImage
from app.schemas.public import ImageOut, ImageSource

WIDTHS = (400, 800, 1600, 2400)


def public_url(key: str) -> str:
    return f"{get_settings().public_media_url.rstrip('/')}/{key.lstrip('/')}"


def available_widths(original_width: int | None) -> list[int]:
    if not original_width:
        return [WIDTHS[0]]
    widths = [w for w in WIDTHS if w <= original_width]
    return widths or [WIDTHS[0]]


def image_out(image: ProjectImage) -> ImageOut:
    return ImageOut(
        id=image.id,
        alt_text=image.alt_text,
        ancho=image.ancho,
        alto=image.alto,
        es_portada=image.es_portada,
        tipo=image.tipo,
        sources=[
            ImageSource(
                width=w,
                avif=public_url(f"{image.storage_key}-{w}.avif"),
                webp=public_url(f"{image.storage_key}-{w}.webp"),
            )
            for w in available_widths(image.ancho)
        ],
    )
