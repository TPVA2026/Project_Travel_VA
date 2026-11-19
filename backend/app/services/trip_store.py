"""Small SQLite repository for durable, account-owned itinerary snapshots."""

import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


def database_path() -> Path:
    configured = os.getenv("TRIPS_DATABASE_PATH", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[2] / "data" / "travel-va.sqlite3"


def _connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS saved_trips (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL,
            title TEXT NOT NULL,
            destination TEXT,
            itinerary_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS idx_saved_trips_owner_updated "
        "ON saved_trips(owner_id, updated_at DESC)"
    )
    return connection


def _serialize(row: sqlite3.Row, *, include_itinerary: bool = True) -> dict[str, Any]:
    result: dict[str, Any] = {
        "id": row["id"],
        "title": row["title"],
        "destination": row["destination"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }
    if include_itinerary:
        result["itinerary"] = json.loads(row["itinerary_json"])
    return result


def create_trip(owner_id: str, itinerary: dict[str, Any]) -> dict[str, Any]:
    trip_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()
    title = str(itinerary.get("title") or itinerary.get("destination") or "Saved trip")[:200]
    destination = itinerary.get("destination") or itinerary.get("destinationId")
    with closing(_connect()) as connection:
        connection.execute(
            "INSERT INTO saved_trips VALUES (?, ?, ?, ?, ?, ?, ?)",
            (trip_id, owner_id, title, destination, json.dumps(itinerary), now, now),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM saved_trips WHERE id = ?", (trip_id,)).fetchone()
    return _serialize(row)


def list_trips(owner_id: str) -> list[dict[str, Any]]:
    with closing(_connect()) as connection:
        rows = connection.execute(
            "SELECT * FROM saved_trips WHERE owner_id = ? ORDER BY updated_at DESC, id DESC",
            (owner_id,),
        ).fetchall()
    return [_serialize(row, include_itinerary=False) for row in rows]


def get_trip(owner_id: str, trip_id: str) -> dict[str, Any] | None:
    with closing(_connect()) as connection:
        row = connection.execute(
            "SELECT * FROM saved_trips WHERE id = ? AND owner_id = ?",
            (trip_id, owner_id),
        ).fetchone()
    return _serialize(row) if row else None


def update_trip(owner_id: str, trip_id: str, itinerary: dict[str, Any]) -> dict[str, Any] | None:
    now = datetime.now(timezone.utc).isoformat()
    title = str(itinerary.get("title") or itinerary.get("destination") or "Saved trip")[:200]
    destination = itinerary.get("destination") or itinerary.get("destinationId")
    with closing(_connect()) as connection:
        cursor = connection.execute(
            """
            UPDATE saved_trips
            SET title = ?, destination = ?, itinerary_json = ?, updated_at = ?
            WHERE id = ? AND owner_id = ?
            """,
            (title, destination, json.dumps(itinerary), now, trip_id, owner_id),
        )
        connection.commit()
        if cursor.rowcount == 0:
            return None
        row = connection.execute("SELECT * FROM saved_trips WHERE id = ?", (trip_id,)).fetchone()
    return _serialize(row)
