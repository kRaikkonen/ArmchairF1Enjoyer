"""Season schedule helpers — resolve a stable slug ↔ FastF1 event, list races."""

import unicodedata

import fastf1


def slugify(event_name: str) -> str:
    """'São Paulo Grand Prix' → 'sao-paulo'. Stable ASCII slug, no 'Grand Prix'."""
    name = event_name.replace("Grand Prix", "").strip()
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return "-".join(ascii_name.lower().split())


def conventional_races(year: int) -> list[dict]:
    """Non-sprint ('conventional') rounds of a season, each {slug, event, round}.

    Sprint weekends are excluded (PLAN §2 — different tyre/parc-fermé rules).
    """
    sched = fastf1.get_event_schedule(year)
    out: list[dict] = []
    for _, r in sched.iterrows():
        if int(r["RoundNumber"]) == 0:
            continue
        if r["EventFormat"] != "conventional":
            continue
        out.append({"slug": slugify(r["EventName"]), "event": r["EventName"], "round": int(r["RoundNumber"])})
    return out


def resolve_event(slug: str, year: int) -> str:
    """Map a slug back to its FastF1 event name (raises if unknown)."""
    sched = fastf1.get_event_schedule(year)
    for _, r in sched.iterrows():
        if int(r["RoundNumber"]) == 0:
            continue
        if slugify(r["EventName"]) == slug:
            return r["EventName"]
    raise ValueError(f"No {year} event matches slug {slug!r}")
