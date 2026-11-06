"""Работа с периодами отчёта: рабочие дни и недели."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterator


def iter_days(start: date, end: date) -> Iterator[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def iter_workdays(start: date, end: date) -> Iterator[date]:
    """Возвращает дни периода без субботы и воскресенья."""
    for day in iter_days(start, end):
        if day.weekday() < 5:
            yield day


@dataclass(frozen=True)
class WeekPeriod:
    """Неделя отчёта, ограниченная выбранным периодом."""

    number: int
    start: date
    end: date
    days: tuple[date, ...]


def build_weeks(
    start: date,
    end: date,
    extra_days: Iterable[date] = (),
) -> list[WeekPeriod]:
    """Разбивает рабочие и дополнительные дни периода по неделям (пн-вс)."""
    included = set(iter_workdays(start, end))
    for day in extra_days:
        if start <= day <= end:
            included.add(day)

    grouped: dict[tuple[int, int], list[date]] = {}
    for day in sorted(included):
        iso = day.isocalendar()
        grouped.setdefault((iso.year, iso.week), []).append(day)

    weeks: list[WeekPeriod] = []
    for number, days in enumerate(grouped.values(), start=1):
        weeks.append(
            WeekPeriod(
                number=number,
                start=days[0],
                end=days[-1],
                days=tuple(days),
            )
        )
    return weeks
