"""Create the buckets if missing: `python -m app.scripts.init_storage`.

sei-public  → anonymous read (project photos, served through the CDN).
sei-private → no public access at all (lead files; signed URLs only).
"""

import json

from botocore.exceptions import ClientError

from app.config import get_settings
from app.services.storage import client


def ensure_bucket(name: str) -> bool:
    s3 = client()
    try:
        s3.head_bucket(Bucket=name)
        return False
    except ClientError:
        s3.create_bucket(Bucket=name)
        return True


def main() -> None:
    s = get_settings()
    s3 = client()
    for name in (s.s3_bucket_public, s.s3_bucket_private):
        print(f"{'Creado' if ensure_bucket(name) else 'Ya existe'}: {name}")
    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {"AWS": ["*"]},
                "Action": ["s3:GetObject"],
                "Resource": [f"arn:aws:s3:::{s.s3_bucket_public}/*"],
            }
        ],
    }
    try:
        s3.put_bucket_policy(Bucket=s.s3_bucket_public, Policy=json.dumps(policy))
    except ClientError as exc:  # R2 manages public access from its dashboard instead
        print(f"No se pudo fijar la política pública ({exc.response['Error']['Code']}).")
    try:
        s3.delete_bucket_policy(Bucket=s.s3_bucket_private)
    except ClientError:
        pass
    print("Listo.")


if __name__ == "__main__":
    main()
