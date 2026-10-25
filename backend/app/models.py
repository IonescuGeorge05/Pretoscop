from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

# JSONB în Postgres, JSON simplu în SQLite (teste)
JSONType = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    family: Mapped[str] = mapped_column(String(100), index=True)
    name: Mapped[str] = mapped_column(String(200))
    edition: Mapped[str] = mapped_column(String(20))  # disc | digital
    storage_gb: Mapped[int] = mapped_column(Integer)
    model_code: Mapped[str | None] = mapped_column(String(50))
    ean: Mapped[str | None] = mapped_column(String(14))
    image_url: Mapped[str | None] = mapped_column(Text)
    msrp_ron: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    msrp_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    msrp_note: Mapped[str | None] = mapped_column(Text)

    offers: Mapped[list["Offer"]] = relationship(back_populates="product")


class Shop(Base):
    __tablename__ = "shops"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    base_url: Mapped[str] = mapped_column(Text)
    search_url_template: Mapped[str | None] = mapped_column(Text)
    shipping_rules: Mapped[dict] = mapped_column(JSONType, default=dict)
    shipping_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    default_warranty_months: Mapped[int] = mapped_column(Integer, default=24)
    affiliate_url_template: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | blocked
    kind: Mapped[str] = mapped_column(String(20), default="retail")  # retail | secondhand | refurbished
    status_reason: Mapped[str | None] = mapped_column(Text)
    last_scraped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    offers: Mapped[list["Offer"]] = relationship(back_populates="shop")


class Offer(Base):
    __tablename__ = "offers"
    __table_args__ = (UniqueConstraint("shop_id", "url", "source", name="uq_offers_shop_url_source"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    affiliate_url: Mapped[str | None] = mapped_column(Text)
    warranty_months: Mapped[int | None] = mapped_column(Integer)
    condition: Mapped[str] = mapped_column(String(20), default="new")
    is_bundle: Mapped[bool] = mapped_column(Boolean, default=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(String(10), default="real")  # real | mock
    seller: Mapped[str | None] = mapped_column(Text)  # cine vinde efectiv (marketplace); None = magazinul
    grade: Mapped[str | None] = mapped_column(String(30))  # refurbished: Bun / Foarte bun / Excelent / Ca nou

    product: Mapped[Product] = relationship(back_populates="offers")
    shop: Mapped[Shop] = relationship(back_populates="offers")
    price_points: Mapped[list["PricePoint"]] = relationship(
        back_populates="offer", order_by="PricePoint.ts", cascade="all, delete-orphan"
    )


class PricePoint(Base):
    """Rând nou doar la schimbare de preț / preț tăiat / stoc. La scrape-urile fără schimbare se actualizează
    doar `confirmed_at`, așa că știm până când prețul e confirmat (după aceea = gol în istoric)."""

    __tablename__ = "price_points"
    __table_args__ = (Index("ix_price_points_offer_ts", "offer_id", "ts"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    offer_id: Mapped[int] = mapped_column(ForeignKey("offers.id", ondelete="CASCADE"))
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    old_price: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    origin: Mapped[str] = mapped_column(String(10), default="scrape")  # scrape | wayback

    offer: Mapped[Offer] = relationship(back_populates="price_points")


class UnmatchedListing(Base):
    __tablename__ = "unmatched_listings"
    __table_args__ = (UniqueConstraint("shop_id", "url", name="uq_unmatched_shop_url"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"))
    url: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    raw: Mapped[dict] = mapped_column(JSONType, default=dict)
    scraped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    shop: Mapped[Shop] = relationship()


class Click(Base):
    __tablename__ = "clicks"

    id: Mapped[int] = mapped_column(primary_key=True)
    offer_id: Mapped[int] = mapped_column(ForeignKey("offers.id", ondelete="CASCADE"), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    target_url: Mapped[str] = mapped_column(Text)
    referer: Mapped[str | None] = mapped_column(Text)
    user_agent: Mapped[str | None] = mapped_column(Text)


class ManualMatch(Base):
    """Asociere făcută de mână din pagina de admin; are prioritate față de matcher la scrape-urile următoare."""

    __tablename__ = "manual_matches"
    __table_args__ = (UniqueConstraint("shop_id", "url", name="uq_manual_matches_shop_url"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"))
    url: Mapped[str] = mapped_column(Text)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"))
    is_bundle: Mapped[bool] = mapped_column(Boolean, default=False)
    ignored: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
