from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def _column_exists(engine: Engine, table: str, column: str) -> bool:
    inspector = inspect(engine)
    columns = inspector.get_columns(table)
    return any(col["name"] == column for col in columns)


def _table_exists(engine: Engine, table: str) -> bool:
    inspector = inspect(engine)
    return table in inspector.get_table_names()


def _add_column(engine: Engine, table: str, column: str, column_type: str) -> None:
    if not _table_exists(engine, table):
        return
    if _column_exists(engine, table, column):
        return
    with engine.begin() as connection:
        connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}"))


def ensure_schema_compatibility(engine: Engine) -> None:
    """
    Lightweight compatibility updater for local/dev environments where
    metadata.create_all() cannot alter pre-existing tables.
    """
    # Soft-delete + provenance columns.
    _add_column(engine, "cases", "deleted_at", "DATETIME")
    _add_column(engine, "xrays", "series_id", "INTEGER")
    _add_column(engine, "xrays", "metadata_json", "JSON")
    _add_column(engine, "xrays", "deleted_at", "DATETIME")
    _add_column(engine, "reconstructions", "input_set_hash", "VARCHAR(64)")
    _add_column(engine, "reconstructions", "pipeline_version", "VARCHAR(64)")
    _add_column(engine, "reconstructions", "confidence_version", "VARCHAR(32)")
    _add_column(engine, "reconstructions", "uncertainty_map_key", "VARCHAR(512)")
    _add_column(engine, "reconstructions", "deleted_at", "DATETIME")
    _add_column(engine, "async_jobs", "stage", "VARCHAR(64) DEFAULT 'queued'")
    _add_column(engine, "async_jobs", "progress", "INTEGER DEFAULT 0")
    _add_column(engine, "async_jobs", "eta_seconds", "INTEGER")
