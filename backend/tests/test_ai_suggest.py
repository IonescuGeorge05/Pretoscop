"""Sugestiile AI pentru anunțurile nepotrivite, cu un client simulat (fără apeluri reale și fără costuri)."""

import json
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.models import Base, Product, Shop, UnmatchedListing
from app.services import ai_suggest
from app.services.ingest import record_unmatched
from tests.test_ingest import scraped


class FakeClient:
    """Imită `client.beta.messages.create` și ține minte cererile."""

    def __init__(self, answers):
        self.answers = list(answers)
        self.calls = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    def _create(self, **kwargs):
        self.calls.append(kwargs)
        answer = self.answers.pop(0)
        if answer == "refusal":
            return SimpleNamespace(stop_reason="refusal", model="claude-opus-5-5", content=[])
        return SimpleNamespace(
            stop_reason="end_turn", model="claude-opus-5-5", content=[SimpleNamespace(type="text", text=json.dumps(answer))]
        )


@pytest.fixture
def session():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        s.add_all([
            Product(slug="ps5-slim-disc-1tb", family="PlayStation 5", name="PS5 Slim cu disc, 1 TB", edition="disc", storage_gb=1000),
            Product(slug="ps5-pro-2tb", family="PlayStation 5", name="PS5 Pro, 2 TB", edition="pro", storage_gb=2000),
            Shop(slug="publi24", name="Publi24", base_url="https://www.publi24.ro", shipping_rules={}, kind="secondhand"),
        ])
        s.commit()
        yield s


def listing(session, title: str, url: str) -> None:
    s = scraped("2500")
    s.title, s.url = title, url
    record_unmatched(session, session.scalar(select(Shop)), s, "ediție neclară")
    session.commit()


def test_suggestion_is_stored_and_request_is_constrained(session):
    listing(session, "Vand PS5 slim cu disc 1TB + 2 manete", "https://p/1")
    client = FakeClient([{"product_slug": "ps5-slim-disc-1tb", "is_bundle": True, "confidence": 0.9, "reason": "scrie „cu disc” și 1TB"}])

    stats = ai_suggest.run_pending(session, client=client)

    assert stats["suggested"] == 1
    row = session.scalar(select(UnmatchedListing))
    assert row.raw["ai"]["product_slug"] == "ps5-slim-disc-1tb" and row.raw["ai"]["is_bundle"] is True
    call = client.calls[0]
    enum = call["output_config"]["format"]["schema"]["properties"]["product_slug"]["enum"]
    assert enum == ["ps5-pro-2tb", "ps5-slim-disc-1tb", "none"]  # doar produse din catalog
    assert call["output_config"]["effort"] == "low"
    # catalogul e în promptul de sistem, sortat (același text la fiecare cerere)
    assert call["system"][0]["text"].index("ps5-pro-2tb") < call["system"][0]["text"].index("ps5-slim-disc-1tb")
    assert "Publi24" not in json.dumps(call["messages"])  # nu trimitem vânzătorul sau orașul


def test_refusal_or_none_are_kept_so_we_do_not_pay_twice(session):
    listing(session, "PS5 slim", "https://p/1")
    listing(session, "Ps5 de vanzare", "https://p/2")
    client = FakeClient(["refusal", {"product_slug": "none", "is_bundle": False, "confidence": 0.8, "reason": "lipsește ediția"}])

    ai_suggest.run_pending(session, client=client)
    assert all("ai" in r.raw for r in session.scalars(select(UnmatchedListing)))
    assert ai_suggest.run_pending(session, client=FakeClient([]))["asked"] == 0  # nimic nou de întrebat


def test_suggestion_survives_a_rescrape_with_the_same_title(session):
    listing(session, "PS5 Pro 2TB", "https://p/1")
    ai_suggest.run_pending(session, client=FakeClient([{"product_slug": "ps5-pro-2tb", "is_bundle": False, "confidence": 0.95, "reason": "Pro 2TB"}]))
    listing(session, "PS5 Pro 2TB", "https://p/1")  # aceeași pagină, citită din nou
    assert session.scalar(select(UnmatchedListing)).raw["ai"]["product_slug"] == "ps5-pro-2tb"
    listing(session, "PS5 Pro 2TB + 2 jocuri", "https://p/1")  # titlul s-a schimbat: sugestia veche nu mai e valabilă
    assert "ai" not in session.scalar(select(UnmatchedListing)).raw


def test_nothing_runs_without_an_api_key(session, monkeypatch):
    monkeypatch.setattr(ai_suggest.settings, "anthropic_api_key", "")
    listing(session, "PS5 slim", "https://p/1")
    assert ai_suggest.run_pending(session) == {"asked": 0, "suggested": 0, "none": 0, "failed": 0}
