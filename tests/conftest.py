import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Must be set before src.api.deps is imported (it reads the key at import time)
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-not-for-production")

# The offline matching modules import each other as top-level modules
for path in (ROOT, ROOT / "scripts" / "matching"):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))
