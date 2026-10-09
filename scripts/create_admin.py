"""Create (or reset the password of) a back-office administrator.

Usage:
    python scripts/create_admin.py --email admin@pricewatch.tn --name "Platform Admin"

The password is prompted interactively so it never lands in shell history.
"""
import argparse
import getpass
import os
import sys

import bcrypt

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.common.db.session import get_db_session
from src.common.models import Admin


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Administrator")
    args = parser.parse_args()

    password = getpass.getpass("Password: ")
    if len(password) < 8:
        sys.exit("Password must be at least 8 characters.")
    if password != getpass.getpass("Confirm password: "):
        sys.exit("Passwords do not match.")

    password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    with get_db_session() as session:
        admin = session.query(Admin).filter(Admin.email == args.email).first()
        if admin:
            admin.password_hash = password_hash
            admin.est_actif = True
            print(f"Password reset for existing admin {args.email}")
        else:
            session.add(Admin(nom=args.name, email=args.email, password_hash=password_hash))
            print(f"Admin {args.email} created")


if __name__ == "__main__":
    main()
