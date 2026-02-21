from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.engine import make_url

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def get_engine():
    settings = get_settings()
    connect_args = {}
    if settings.database_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
        url = make_url(settings.database_url)
        if url.database:
            db_path = Path(url.database)
            if not db_path.is_absolute():
                db_path = Path.cwd() / db_path
            db_path.parent.mkdir(parents=True, exist_ok=True)
    return create_engine(settings.database_url, pool_pre_ping=True, connect_args=connect_args)


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
