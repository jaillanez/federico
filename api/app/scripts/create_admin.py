"""Create (or reset) an admin user interactively: `make create-admin`."""

import argparse
import asyncio
import getpass

from email_validator import EmailNotValidError, validate_email
from sqlalchemy import select

from app.db import SessionLocal
from app.models import AdminUser
from app.security import hash_password

MIN_PASSWORD_LENGTH = 12


async def create_admin(email: str, nombre: str, password: str, rol: str) -> bool:
    """Create the user, or reset its password if it exists. Returns True if created."""
    async with SessionLocal() as session:
        user = await session.scalar(select(AdminUser).where(AdminUser.email == email))
        created = user is None
        if user is None:
            user = AdminUser(email=email, nombre=nombre, rol=rol, password_hash="")
            session.add(user)
        user.password_hash = hash_password(password)
        user.activo = True
        await session.commit()
        return created


def main() -> None:
    parser = argparse.ArgumentParser(description="Crear un usuario del panel")
    parser.add_argument("--email")
    parser.add_argument("--nombre")
    parser.add_argument("--rol", choices=["admin", "editor"], default="admin")
    args = parser.parse_args()

    email = args.email or input("Email: ").strip()
    try:
        email = validate_email(email, check_deliverability=False).normalized
    except EmailNotValidError as exc:
        raise SystemExit(f"Email inválido: {exc}") from exc
    nombre = args.nombre or input("Nombre: ").strip() or email
    password = getpass.getpass("Contraseña: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise SystemExit(f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.")
    if getpass.getpass("Repetí la contraseña: ") != password:
        raise SystemExit("Las contraseñas no coinciden.")

    created = asyncio.run(create_admin(email, nombre, password, args.rol))
    print("Usuario creado." if created else "Usuario existente: contraseña actualizada.")


if __name__ == "__main__":
    main()
