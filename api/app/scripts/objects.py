"""Tiny S3 CLI for the backup scripts (avoids installing the AWS CLI):

python -m app.scripts.objects put  <bucket> <key> <file>
python -m app.scripts.objects get  <bucket> <key> <file>
python -m app.scripts.objects latest <bucket> <prefix>        → prints the newest key
python -m app.scripts.objects prune  <bucket> <prefix> <days> → deletes older objects
"""

import sys
from datetime import UTC, datetime, timedelta

from app.services.storage import client


def main(argv: list[str]) -> int:
    cmd, bucket, *rest = argv
    s3 = client()
    if cmd == "put":
        key, path = rest
        s3.upload_file(path, bucket, key)
    elif cmd == "get":
        key, path = rest
        s3.download_file(bucket, key, path)
    elif cmd in ("latest", "prune"):
        prefix = rest[0]
        objects = []
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
            objects += page.get("Contents", [])
        if cmd == "latest":
            if not objects:
                print("No hay backups.", file=sys.stderr)
                return 1
            print(max(objects, key=lambda o: o["LastModified"])["Key"])
        else:
            limit = datetime.now(UTC) - timedelta(days=int(rest[1]))
            old = [{"Key": o["Key"]} for o in objects if o["LastModified"] < limit]
            for i in range(0, len(old), 1000):
                s3.delete_objects(Bucket=bucket, Delete={"Objects": old[i : i + 1000]})  # type: ignore[typeddict-item]
            print(f"Borrados {len(old)} backups de más de {rest[1]} días.")
    else:
        print(__doc__, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
