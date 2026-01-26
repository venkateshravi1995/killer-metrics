"""Analytics queries for internal reporting."""

from datetime import datetime

from sqlalchemy import func, select

from app.db.postgres import PostgresExecutor
from app.db.schema import Event


async def fetch_event_counts(
    executor: PostgresExecutor,
    start_time: datetime,
    end_time: datetime,
) -> list[dict[str, object]]:
    """Return event counts grouped by type for the given time window."""
    stmt = (
        select(Event.event_type, func.count().label("event_count"))
        .where(Event.event_time >= start_time, Event.event_time < end_time)
        .group_by(Event.event_type)
        .order_by(func.count().desc())
    )
    result = await executor.execute(stmt)
    rows = result.mappings().all()
    return [{"event_type": row["event_type"], "event_count": row["event_count"]} for row in rows]
