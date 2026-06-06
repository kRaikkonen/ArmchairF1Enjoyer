"""Derive official race results from FastF1 session data.

Single Source of Truth (PLAN §8.1): the *only* authority for "what actually
happened in the race" is the FastF1-pulled session results. The model JSON's
`results` field, the frontend comparison view, and every test baseline must be
derived from here — never hand-typed, and never confused with the starting grid.

The previous `results` block in bahrain.json was hand-entered, did not match
FastF1, and even listed a driver from a different event (COL, who was not in
the 2025 Bahrain field). This module exists so that can never happen again:
results become a pure derivative of FastF1.
"""

from typing import Any


def _classify(classified_position: str) -> str:
    """Map a FastF1 ClassifiedPosition string to a finishing status.

    FastF1 encodes ClassifiedPosition as either a finishing position digit, or a
    single-letter code for non-classified entries:
      - "1".."20" -> classified finisher
      - "R"        -> retired (did not finish)
      - "D"        -> disqualified
      - "W"/"E"/"N"-> withdrawn / excluded / not classified (treated as DNF)
    """
    cp = classified_position.strip()
    if cp.isdigit():
        return "finished"
    if cp == "D":
        return "dsq"
    return "dnf"


def extract_results(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build canonical race-result entries from FastF1 session result rows.

    Args:
        records: list of row dicts as produced by
            ``session.results.to_dict("records")``. The committed ground-truth
            fixture ``tests/fixtures/<event>-meta.json`` stores these same rows,
            so this function is unit-testable offline without hitting FastF1.

    Returns:
        Entries sorted by finishing position (classified finishers first, then
        DNF/DSQ at the back, exactly as FastF1 orders them). Each entry uses the
        camelCase schema consumed by the TS engine (RaceResultEntry):

            position           int    — FastF1 finishing-classification order
            driverId           str    — driver abbreviation, e.g. "HAM"
            team               str    — full FastF1 team name
            classifiedPosition str    — raw FastF1 code: "5", "R", "D"
            status             str    — "finished" | "dnf" | "dsq"
            dnf                bool    — status != "finished" (kept so the
                                         comparison view can split classified
                                         finishers from non-finishers)
    """
    entries: list[dict[str, Any]] = []
    for r in records:
        classified_position = str(r.get("ClassifiedPosition", "")).strip()
        status = _classify(classified_position)
        entries.append(
            {
                "position": int(float(r["Position"])),
                "driverId": str(r["Abbreviation"]),
                "team": str(r["TeamName"]),
                "classifiedPosition": classified_position,
                "status": status,
                "dnf": status != "finished",
            }
        )

    entries.sort(key=lambda e: e["position"])
    return entries
