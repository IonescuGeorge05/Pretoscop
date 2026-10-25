"""Calculul prețului final real: preț + transport + penalizare garanție. Funcții pure."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

# Configurabil: penalizare pe lună de garanție lipsă față de referință
WARRANTY_PENALTY_RATE = Decimal("0.005")  # 0.5% din preț / lună lipsă
WARRANTY_REFERENCE_MONTHS = 24

CENT = Decimal("0.01")


def _money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class PriceBreakdown:
    price: Decimal
    shipping: Decimal
    warranty_months: int
    warranty_penalty: Decimal
    final_price: Decimal
    cost_per_warranty_month: Decimal


def shipping_cost(price: Decimal, shipping_rules: dict | None) -> Decimal:
    rules = shipping_rules or {}
    free_over = rules.get("free_over")
    flat = Decimal(str(rules.get("flat") or 0))
    if free_over is not None and price >= Decimal(str(free_over)):
        return Decimal("0.00")
    return _money(flat)


def warranty_penalty(
    price: Decimal,
    warranty_months: int,
    rate: Decimal = WARRANTY_PENALTY_RATE,
    reference_months: int = WARRANTY_REFERENCE_MONTHS,
) -> Decimal:
    missing = max(0, reference_months - warranty_months)
    return _money(price * rate * missing)


def final_price(
    price: Decimal,
    shipping_rules: dict | None,
    warranty_months: int,
    rate: Decimal = WARRANTY_PENALTY_RATE,
    reference_months: int = WARRANTY_REFERENCE_MONTHS,
) -> PriceBreakdown:
    price = _money(Decimal(price))
    shipping = shipping_cost(price, shipping_rules)
    penalty = warranty_penalty(price, warranty_months, rate, reference_months)
    total = _money(price + shipping + penalty)
    per_month = _money(total / warranty_months) if warranty_months > 0 else total
    return PriceBreakdown(
        price=price,
        shipping=shipping,
        warranty_months=warranty_months,
        warranty_penalty=penalty,
        final_price=total,
        cost_per_warranty_month=per_month,
    )


@dataclass(frozen=True)
class ComponentDiff:
    component: str
    a: Decimal | int
    b: Decimal | int
    diff: Decimal | int  # b - a


@dataclass(frozen=True)
class Comparison:
    a: PriceBreakdown
    b: PriceBreakdown
    diffs: list[ComponentDiff]
    winner: str | None  # "a" | "b" | None (egalitate)
    explanation: str


def _lei(v: Decimal) -> str:
    return f"{v:,.2f}".replace(",", " ").replace(".", ",") + " lei"


def compare(a: PriceBreakdown, b: PriceBreakdown, label_a: str = "A", label_b: str = "B") -> Comparison:
    fields = ["price", "shipping", "warranty_months", "warranty_penalty", "final_price", "cost_per_warranty_month"]
    diffs = [ComponentDiff(f, getattr(a, f), getattr(b, f), getattr(b, f) - getattr(a, f)) for f in fields]

    if a.final_price == b.final_price:
        return Comparison(a, b, diffs, None, f"{label_a} și {label_b} au același preț final ({_lei(a.final_price)}).")

    winner, w, l, wl, ll = ("a", a, b, label_a, label_b) if a.final_price < b.final_price else ("b", b, a, label_b, label_a)
    parts = [f"{wl} câștigă la preț final: {_lei(w.final_price)} vs {_lei(l.final_price)} (diferență {_lei(l.final_price - w.final_price)})."]
    if w.price > l.price:
        hidden = []
        if l.shipping > w.shipping:
            hidden.append(f"transport {_lei(l.shipping)} vs {_lei(w.shipping)}")
        if l.warranty_months < w.warranty_months:
            hidden.append(
                f"garanție {l.warranty_months} luni vs {w.warranty_months} luni (penalizare {_lei(l.warranty_penalty)})"
            )
        parts.append(
            f"Deși prețul afișat la {wl} e mai mare cu {_lei(w.price - l.price)}, {ll} pierde din cauza "
            f"costurilor ascunse: {'; '.join(hidden)}."
        )
    return Comparison(a, b, diffs, winner, " ".join(parts))
