from dataclasses import dataclass
from datetime import date
from pathlib import Path

import yaml

CALENDAR_PATH = Path(__file__).resolve().parent / "calendar.yaml"


@dataclass(frozen=True)
class Event:
    slug: str
    name: str
    date: date
    start: date
    end: date


def load_calendar(path: Path = CALENDAR_PATH) -> list[Event]:
    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    events = [
        Event(slug=e["slug"], name=e["name"], date=o["date"], start=o["start"], end=o["end"])
        for e in data["events"]
        for o in e["occurrences"]
    ]
    return sorted(events, key=lambda ev: ev.date)


def events_between(calendar: list[Event], start: date, end: date) -> list[Event]:
    return [e for e in calendar if e.end >= start and e.start <= end]
