#!/usr/bin/env python3
"""Sync BrickCircle's existing LEGO catalogue from Rebrickable's daily CSV exports.

Safe by design: this enriches/updates rows already present in lego_sets. It does not
blindly import Rebrickable's entire catalogue, delete rows, or overwrite valuation.
"""
import csv
import gzip
import io
import json
import os
import sys
import urllib.request

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SETS_URL = "https://cdn.rebrickable.com/media/downloads/sets.csv.gz"
THEMES_URL = "https://cdn.rebrickable.com/media/downloads/themes.csv.gz"


def download_csv(url):
    req = urllib.request.Request(url, headers={"User-Agent": "BrickCircle-Catalog-Sync/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:
        return list(csv.DictReader(io.TextIOWrapper(gz, encoding="utf-8")))


def sb_request(path, method="GET", body=None, extra_headers=None):
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as r:
        payload = r.read()
        return json.loads(payload) if payload else None


def base_num(set_num):
    return set_num.rsplit("-", 1)[0] if "-" in set_num else set_num


def main():
    sets = download_csv(SETS_URL)
    themes = download_csv(THEMES_URL)
    if len(sets) < 10000 or len(themes) < 100:
        raise RuntimeError(f"Rebrickable export validation failed: {len(sets)} sets, {len(themes)} themes")

    theme_names = {int(t["id"]): t["name"] for t in themes}
    by_base = {}
    for s in sets:
        # Prefer variant -1 when several Rebrickable records share a base set number.
        b = base_num(s["set_num"])
        if b not in by_base or s["set_num"].endswith("-1"):
            by_base[b] = s

    existing = sb_request("lego_sets?select=set_number") or []
    updates = []
    missing = []
    for row in existing:
        num = row["set_number"]
        src = by_base.get(base_num(num))
        if not src:
            missing.append(num)
            continue
        updates.append({
            "set_number": num,
            "name": src["name"],
            "year": int(src["year"]) if src.get("year") else None,
            "piece_count": int(src["num_parts"]) if src.get("num_parts") else None,
            "theme": theme_names.get(int(src["theme_id"]), "Unknown"),
            "rebrickable_set_num": src["set_num"],
            "rebrickable_theme_id": int(src["theme_id"]),
            "catalog_source": "Rebrickable",
        })

    # Upsert in small batches. Missing Rebrickable rows are deliberately untouched.
    for i in range(0, len(updates), 200):
        sb_request(
            "lego_sets?on_conflict=set_number",
            method="POST",
            body=updates[i:i+200],
            extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )

    # Stamp only successfully matched rows via individual PATCH requests. Catalogue is
    # currently small, so this remains comfortably lightweight and avoids false stamps.
    for u in updates:
        n = urllib.parse.quote(u["set_number"], safe="")
        sb_request(f"lego_sets?set_number=eq.{n}", method="PATCH",
                   body={"catalog_updated_at": "now()"})

    print(json.dumps({"rebrickable_sets": len(sets), "brickcircle_rows": len(existing),
                      "updated": len(updates), "unmatched": missing[:25]}, indent=2))


if __name__ == "__main__":
    import urllib.parse
    try:
        main()
    except Exception as exc:
        print(f"catalog sync failed: {exc}", file=sys.stderr)
        raise
