"""Admin projects and photos (real PostgreSQL + MinIO; images processed with Pillow)."""

import io
import json
import os
import shutil
import subprocess
from typing import Any

import anyio
import httpx
import pytest
from httpx import AsyncClient
from PIL import Image

from app.config import get_settings
from app.services import storage

pytestmark = pytest.mark.usefixtures("clean_content")

EXIFTOOL = shutil.which("exiftool")
REQUIRE_EXIFTOOL = os.environ.get("REQUIRE_EXIFTOOL") == "1"


def photo_with_gps(width: int = 1800, height: int = 1200, orientation: int = 6) -> bytes:
    """A JPEG with GPS coordinates (San Juan) and an EXIF orientation tag."""
    img = Image.new("RGB", (width, height), (200, 40, 40))
    img.paste((40, 40, 200), (0, 0, width // 2, height))  # left half blue: reveals rotation
    exif = Image.Exif()
    exif[0x0112] = orientation  # 6 = rotate 90° clockwise to display
    exif[0x010F] = "Camara de prueba"  # Make
    gps = exif.get_ifd(0x8825)
    gps.update({1: "S", 2: (31.0, 32.0, 0.0), 3: "W", 4: (68.0, 31.0, 0.0)})
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif)
    data = buf.getvalue()
    assert Image.open(io.BytesIO(data)).getexif().get_ifd(0x8825), "fixture must carry GPS"
    return data


def exif_tags(path: Any) -> dict[str, Any]:
    assert EXIFTOOL
    out = subprocess.run([EXIFTOOL, "-json", "-G", str(path)], capture_output=True, check=True)
    parsed: list[dict[str, Any]] = json.loads(out.stdout)
    return parsed[0]


async def create(client: AsyncClient, **fields: Any) -> dict[str, Any]:
    res = await client.post("/api/admin/projects", json={"titulo": "Tablero de bombeo", **fields})
    assert res.status_code == 201, res.text
    created: dict[str, Any] = res.json()
    return created


async def public_object(key: str) -> bytes:
    s = get_settings()
    async with httpx.AsyncClient() as http:
        res = await http.get(f"{s.s3_endpoint_url}/{s.s3_bucket_public}/{key}")
        assert res.status_code == 200, key
        return res.content


async def test_create_generates_unique_slugs_and_resolves_catalog(
    admin_client: AsyncClient, rebuilds: list[str]
) -> None:
    from app.scripts.seed import seed

    await seed()
    a = await create(admin_client, categoria="tableros-y-bombeo", sector="fincas-y-riego")
    b = await create(admin_client)
    assert a["slug"] == "tablero-de-bombeo"
    assert b["slug"] == "tablero-de-bombeo-2"
    assert a["categoria"]["nombre"] == "Tableros y bombeo"
    assert a["sector"]["slug"] == "fincas-y-riego"
    assert not a["publicado"]
    assert rebuilds == []  # drafts never rebuild the site
    bad = await admin_client.post("/api/admin/projects", json={"titulo": "X", "categoria": "nada"})
    assert bad.status_code == 422


async def test_publishing_and_editing_public_content_rebuilds(
    admin_client: AsyncClient, rebuilds: list[str]
) -> None:
    p = await create(admin_client)
    res = await admin_client.patch(
        f"/api/admin/projects/{p['id']}",
        json={"publicado": True, "provincia": "San Juan", "potencia_kw": 75, "lat": -31.5},
    )
    assert res.status_code == 200
    assert res.json()["publicado"] and res.json()["potencia_kw"] == 75
    assert len(rebuilds) == 1
    await admin_client.patch(f"/api/admin/projects/{p['id']}", json={"publicado": False})
    assert len(rebuilds) == 2  # unpublishing also rebuilds
    await admin_client.patch(f"/api/admin/projects/{p['id']}", json={"resumen": "Borrador"})
    assert len(rebuilds) == 2  # editing a hidden project does not
    out_of_range = await admin_client.patch(f"/api/admin/projects/{p['id']}", json={"lat": 10})
    assert out_of_range.status_code == 422


async def test_list_search_and_filter(admin_client: AsyncClient) -> None:
    await create(admin_client, titulo="Subestación Luján", publicado=True)
    await create(admin_client, titulo="CCM bodega")
    res = await admin_client.get("/api/admin/projects", params={"q": "luján"})
    assert [p["titulo"] for p in res.json()["items"]] == ["Subestación Luján"]
    res = await admin_client.get("/api/admin/projects", params={"publicado": "false"})
    assert [p["titulo"] for p in res.json()["items"]] == ["CCM bodega"]


async def test_uploaded_photos_are_processed_without_metadata(
    admin_client: AsyncClient, client: AsyncClient
) -> None:
    p = await create(admin_client, publicado=True)
    res = await admin_client.post(
        f"/api/admin/projects/{p['id']}/images",
        files=[("files", ("obra.jpg", photo_with_gps(), "image/jpeg"))],
    )
    assert res.status_code == 202
    assert res.json()[0]["procesando"] is True  # processed in the background

    detail = (await admin_client.get(f"/api/admin/projects/{p['id']}")).json()
    img = detail["imagenes"][0]
    assert img["procesando"] is False
    assert img["es_portada"] is True  # first photo becomes the cover
    # EXIF orientation 6 was applied: 1800x1200 becomes portrait 1200x1800.
    assert (img["ancho"], img["alto"]) == (1200, 1800)
    assert [s["width"] for s in img["sources"]] == [400, 800]  # never upscaled

    key = img["sources"][-1]["webp"].split(f"/{get_settings().s3_bucket_public}/")[1]
    webp = await public_object(key)
    out = Image.open(io.BytesIO(webp))
    assert out.size == (800, 1200)
    assert not out.getexif(), "no EXIF at all"
    assert "xmp" not in out.info and "icc_profile" not in out.info
    # Rotation really baked in: top-left pixel comes from the blue half after a 90° turn.
    r, _g, b = out.convert("RGB").getpixel((10, 10))  # type: ignore[misc]
    assert b > r

    avif = await public_object(key.replace(".webp", ".avif"))
    assert Image.open(io.BytesIO(avif)).format == "AVIF"

    # Public API now shows the photo.
    public = (await client.get(f"/api/projects/{p['slug']}")).json()
    assert len(public["imagenes"]) == 1


@pytest.mark.skipif(not EXIFTOOL and not REQUIRE_EXIFTOOL, reason="exiftool no instalado")
async def test_published_photos_have_no_gps_according_to_exiftool(
    admin_client: AsyncClient, tmp_path: Any
) -> None:
    assert EXIFTOOL, "REQUIRE_EXIFTOOL=1 pero exiftool no está instalado"
    original = tmp_path / "original.jpg"
    original.write_bytes(photo_with_gps())
    before = await anyio.to_thread.run_sync(exif_tags, original)
    assert any("GPS" in k for k in before), (
        "the fixture must have GPS for the test to mean anything"
    )

    p = await create(admin_client)
    await admin_client.post(
        f"/api/admin/projects/{p['id']}/images",
        files=[("files", ("obra.jpg", original.read_bytes(), "image/jpeg"))],
    )
    img = (await admin_client.get(f"/api/admin/projects/{p['id']}")).json()["imagenes"][0]
    bucket = f"/{get_settings().s3_bucket_public}/"
    for source in img["sources"]:
        for fmt in ("webp", "avif"):
            path = tmp_path / f"{source['width']}.{fmt}"
            path.write_bytes(await public_object(source[fmt].split(bucket)[1]))
            tags = await anyio.to_thread.run_sync(exif_tags, path)
            leaked = [k for k in tags if "GPS" in k or k.startswith("EXIF:")]
            assert leaked == [], (path.name, leaked)


async def test_cover_reorder_alt_text_and_delete(admin_client: AsyncClient) -> None:
    p = await create(admin_client)
    files = [("files", (f"f{i}.jpg", photo_with_gps(600, 400, 1), "image/jpeg")) for i in range(3)]
    uploaded = (
        await admin_client.post(f"/api/admin/projects/{p['id']}/images", files=files)
    ).json()
    ids = [i["id"] for i in uploaded]

    res = await admin_client.patch(
        f"/api/admin/images/{ids[2]}",
        json={"es_portada": True, "alt_text": " Tablero terminado ", "tipo": "despues"},
    )
    assert res.status_code == 200
    detail = (await admin_client.get(f"/api/admin/projects/{p['id']}")).json()
    covers = [i["id"] for i in detail["imagenes"] if i["es_portada"]]
    assert covers == [ids[2]]  # only one cover
    assert detail["portada"]["alt_text"] == "Tablero terminado"

    order = [ids[2], ids[0], ids[1]]
    res = await admin_client.post(
        f"/api/admin/projects/{p['id']}/images/order", json={"ids": order}
    )
    assert [i["id"] for i in res.json()] == order
    detail = (await admin_client.get(f"/api/admin/projects/{p['id']}")).json()
    assert [i["id"] for i in detail["imagenes"]] == order
    partial = await admin_client.post(
        f"/api/admin/projects/{p['id']}/images/order", json={"ids": order[:2]}
    )
    assert partial.status_code == 422

    # Deleting the cover promotes the next photo and removes its files from the bucket.
    key = detail["imagenes"][0]["sources"][0]["webp"].split(f"/{get_settings().s3_bucket_public}/")[
        1
    ]
    assert (await admin_client.delete(f"/api/admin/images/{ids[2]}")).status_code == 204
    detail = (await admin_client.get(f"/api/admin/projects/{p['id']}")).json()
    assert detail["imagenes"][0]["id"] == ids[0] and detail["imagenes"][0]["es_portada"]
    s = get_settings()
    async with httpx.AsyncClient() as http:
        assert (
            await http.get(f"{s.s3_endpoint_url}/{s.s3_bucket_public}/{key}")
        ).status_code == 404


async def test_rejects_non_images_and_deletes_projects(admin_client: AsyncClient) -> None:
    p = await create(admin_client)
    bad = await admin_client.post(
        f"/api/admin/projects/{p['id']}/images",
        files=[("files", ("factura.pdf", b"%PDF-1.4 nope", "application/pdf"))],
    )
    assert bad.status_code == 422
    assert "no es una foto" in bad.json()["error"]["message"]

    await admin_client.post(
        f"/api/admin/projects/{p['id']}/images",
        files=[("files", ("f.jpg", photo_with_gps(500, 500, 1), "image/jpeg"))],
    )
    assert (await admin_client.delete(f"/api/admin/projects/{p['id']}")).status_code == 204
    assert (await admin_client.get(f"/api/admin/projects/{p['id']}")).status_code == 404
    listing = storage.client().list_objects_v2(
        Bucket=get_settings().s3_bucket_public, Prefix=f"projects/{p['id']}/"
    )
    assert listing.get("KeyCount", 0) == 0


async def test_unprocessed_photos_are_not_public(
    admin_client: AsyncClient, client: AsyncClient
) -> None:
    from app.db import SessionLocal
    from app.models import ProjectImage

    p = await create(admin_client, publicado=True)
    async with SessionLocal() as s:
        s.add(ProjectImage(project_id=p["id"], storage_key="projects/x/pending", es_portada=True))
        await s.commit()
    public = (await client.get(f"/api/projects/{p['slug']}")).json()
    assert public["imagenes"] == [] and public["portada"] is None


async def test_storage_failure_never_leaves_a_photo_processing(
    admin_client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def full_disk(key: str, data: bytes, content_type: str) -> None:
        raise OSError("storage full")

    monkeypatch.setattr(storage, "put_public", full_disk)
    p = await create(admin_client)
    res = await admin_client.post(
        f"/api/admin/projects/{p['id']}/images",
        files=[("files", ("f.jpg", photo_with_gps(500, 500, 1), "image/jpeg"))],
    )
    assert res.status_code == 202
    detail = (await admin_client.get(f"/api/admin/projects/{p['id']}")).json()
    assert detail["imagenes"] == []  # removed instead of stuck in "procesando"
