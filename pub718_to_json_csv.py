#!/usr/bin/env python3
"""
Generate NY Publication 718 jurisdiction tax rates into CSV + JSON.

Input:  NYS Publication 718 PDF (pub718.pdf)
Output: pub718_rates_<effective-date>.csv, pub718_rates_<effective-date>.json

Works by extracting plain text with PyMuPDF (fitz) and parsing the repeating
pattern: <locality name>, <tax rate%>, <reporting code>.
It also keeps hierarchy for lines like "Cayuga – except" followed by cities.

Usage:
  python pub718_to_json_csv.py --pdf pub718.pdf --outdir .
"""

import argparse
import datetime as _dt
import json
import re
from pathlib import Path

import fitz  # PyMuPDF
import pandas as pd

FRAC_MAP = {
    "¼": 0.25,
    "½": 0.5,
    "¾": 0.75,
    "⅛": 0.125,
    "⅜": 0.375,
    "⅝": 0.625,
    "⅞": 0.875,
}

RATE_RE = re.compile(r"^(\d+)([¼½¾⅛⅜⅝⅞])?$")
CODE_RE = re.compile(r"^\d{4}$")


def parse_rate_percent(s: str):
    s = s.strip()
    m = RATE_RE.match(s)
    if not m:
        return None
    val = float(m.group(1))
    if m.group(2):
        val += FRAC_MAP[m.group(2)]
    return val


def clean_name(name: str) -> str:
    name = name.strip().replace("\t", "").replace("\u2002", "")
    if name.startswith("*"):
        return name[1:].strip()
    return name


def extract_lines(pdf_path: Path) -> list[str]:
    doc = fitz.open(str(pdf_path))
    all_lines: list[str] = []
    for p in doc:
        txt = p.get_text("text")
        for ln in txt.splitlines():
            ln = ln.strip().replace("\t", "").replace("\u2002", "")
            if ln:
                all_lines.append(ln)
    return all_lines


def infer_effective_date(lines: list[str]) -> str | None:
    # Example: "Effective March 1, 2025"
    for ln in lines[:40]:
        m = re.search(r"Effective\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})", ln)
        if m:
            month, day, year = m.group(1), int(m.group(2)), int(m.group(3))
            try:
                dt = _dt.datetime.strptime(f"{month} {day} {year}", "%B %d %Y").date()
                return dt.isoformat()
            except ValueError:
                return None
    return None


def parse_pub718(pdf_path: Path) -> tuple[str | None, list[dict]]:
    lines = extract_lines(pdf_path)

    # Find where the jurisdiction list starts
    start_idx = None
    for i, ln in enumerate(lines):
        if ln.strip() == "New York State only":
            start_idx = i
            break
    if start_idx is None:
        raise RuntimeError("Could not find start marker 'New York State only' in PDF text.")

    effective_date = infer_effective_date(lines)

    data_lines = lines[start_idx:]
    rows: list[dict] = []
    current_county: str | None = None

    i = 0
    while i < len(data_lines) - 2:
        name_raw = data_lines[i].strip()
        # Skip reference-only lines like "*Bronx – see New York City"
        if "see New York City" in name_raw:
            i += 1
            continue

        name = clean_name(name_raw)
        rate_s = data_lines[i + 1].strip()
        code_s = data_lines[i + 2].strip()

        rate_pct = parse_rate_percent(rate_s)
        if rate_pct is None or not CODE_RE.match(code_s):
            i += 1
            continue

        # Classify / maintain hierarchy
        kind = "county"
        parent = None
        base = name

        if name == "New York State only":
            kind = "state_only"
            current_county = None
        elif name == "New York City":
            kind = "nyc"
            current_county = None
        elif name.endswith("(city)"):
            kind = "city"
            parent = current_county
        elif " – except" in name:
            kind = "county_outside"
            base = name.replace(" – except", "").strip()
            current_county = base
        else:
            # plain county name
            current_county = name

        rows.append(
            {
                "locality": name,
                "base": base,
                "kind": kind,
                "parent_county": parent,
                "tax_rate_percent": rate_pct,
                "tax_rate_decimal": rate_pct / 100.0,
                "reporting_code": code_s,
            }
        )
        i += 3

    return effective_date, rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf", required=True, help="Path to pub718.pdf")
    ap.add_argument("--outdir", default=".", help="Output directory")
    args = ap.parse_args()

    pdf_path = Path(args.pdf).expanduser().resolve()
    outdir = Path(args.outdir).expanduser().resolve()
    outdir.mkdir(parents=True, exist_ok=True)

    effective_date, rows = parse_pub718(pdf_path)
    effective = effective_date or "unknown-date"

    df = pd.DataFrame(rows)

    csv_path = outdir / f"pub718_rates_{effective}.csv"
    json_path = outdir / f"pub718_rates_{effective}.json"

    df.to_csv(csv_path, index=False)
    payload = {
        "source_pdf": pdf_path.name,
        "effective_date": effective_date,
        "generated_utc": _dt.datetime.utcnow().isoformat() + "Z",
        "rows": rows,
    }
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Wrote CSV:  {csv_path}")
    print(f"Wrote JSON: {json_path}")
    print(f"Rows: {len(rows)}")


if __name__ == "__main__":
    main()
