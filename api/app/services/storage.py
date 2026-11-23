"""S3-compatible object storage (MinIO locally, Cloudflare R2 in production).

boto3 is synchronous, so every call runs in a worker thread.
"""

from functools import lru_cache
from typing import TYPE_CHECKING

import anyio
import boto3
from botocore.config import Config

from app.config import get_settings

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

SIGNED_URL_SECONDS = 300  # signed downloads expire after 5 minutes


@lru_cache
def client() -> "S3Client":
    s = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint_url,
        region_name=s.s3_region,
        aws_access_key_id=s.s3_access_key.get_secret_value(),
        aws_secret_access_key=s.s3_secret_key.get_secret_value(),
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )


async def put_private(key: str, data: bytes, content_type: str) -> None:
    bucket = get_settings().s3_bucket_private
    await anyio.to_thread.run_sync(
        lambda: client().put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
    )


async def delete_private(keys: list[str]) -> None:
    if not keys:
        return
    bucket = get_settings().s3_bucket_private
    objects = [{"Key": k} for k in keys]
    for i in range(0, len(objects), 1000):  # S3 limit per request
        chunk = objects[i : i + 1000]
        await anyio.to_thread.run_sync(
            lambda c=chunk: client().delete_objects(  # type: ignore[misc]
                Bucket=bucket, Delete={"Objects": c, "Quiet": True}
            )
        )


def signed_private_url(key: str, filename: str, expires: int = SIGNED_URL_SECONDS) -> str:
    """Short-lived download URL for a private object (no network call)."""
    safe_name = filename.replace('"', "").replace("\r", "").replace("\n", "")
    return client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": get_settings().s3_bucket_private,
            "Key": key,
            "ResponseContentDisposition": f'attachment; filename="{safe_name}"',
        },
        ExpiresIn=expires,
    )
