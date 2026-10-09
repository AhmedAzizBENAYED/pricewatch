from contextlib import contextmanager
from sqlalchemy.orm import Session
from src.common.database import SessionLocal
import logging

logger = logging.getLogger(__name__)


@contextmanager
def get_db_session() -> Session:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()