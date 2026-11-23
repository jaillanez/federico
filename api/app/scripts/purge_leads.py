"""Scheduled task (daily): `python -m app.scripts.purge_leads`. See services/retention.py."""

import asyncio

from app.db import SessionLocal
from app.services.retention import purge_old_leads


async def main() -> None:
    async with SessionLocal() as session:
        count = await purge_old_leads(session)
    print(f"Consultas eliminadas por antigüedad: {count}")


if __name__ == "__main__":
    asyncio.run(main())
