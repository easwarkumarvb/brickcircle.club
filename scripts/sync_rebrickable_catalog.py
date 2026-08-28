#!/usr/bin/env python3
"""Sync BrickCircle's existing LEGO catalogue from Rebrickable daily CSV exports.
Safe by design: update existing lego_sets only; never delete rows or touch valuation.
"""
import csv, gzip, io, json, os, sys, urllib.request, urllib.parse
from datetime import datetime, timezone

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SETS_URL = "https://cdn.rebrickable.com/media/downloads/sets.csv.gz"
THEMES_URL = "https://cdn.rebrickable.com/media/downloads/themes.csv.gz"

def download_csv(url):
    req=urllib.request.Request(url,headers={"User-Agent":"BrickCircle-Catalog-Sync/1.0"})
    with urllib.request.urlopen(req,timeout=60) as r: raw=r.read()
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:
        return list(csv.DictReader(io.TextIOWrapper(gz,encoding="utf-8")))

def sb(path,method="GET",body=None,extra=None):
    h={"apikey":SERVICE_KEY,"Authorization":f"Bearer {SERVICE_KEY}","Content-Type":"application/json"}
    if extra: h.update(extra)
    req=urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}",data=json.dumps(body).encode() if body is not None else None,headers=h,method=method)
    with urllib.request.urlopen(req,timeout=60) as r:
        p=r.read(); return json.loads(p) if p else None

def base(n): return n.rsplit("-",1)[0] if "-" in n else n

def main():
    sets=download_csv(SETS_URL); themes=download_csv(THEMES_URL)
    if len(sets)<10000 or len(themes)<100: raise RuntimeError(f"export validation failed: {len(sets)} sets/{len(themes)} themes")
    theme_names={int(t["id"]):t["name"] for t in themes}
    by_base={}
    for s in sets:
        b=base(s["set_num"])
        if b not in by_base or s["set_num"].endswith("-1"): by_base[b]=s
    existing=sb("lego_sets?select=set_number") or []
    stamp=datetime.now(timezone.utc).isoformat()
    updates=[]; missing=[]
    for row in existing:
        num=row["set_number"]; src=by_base.get(base(num))
        if not src: missing.append(num); continue
        updates.append({"set_number":num,"name":src["name"],"year":int(src["year"]) if src.get("year") else None,
          "piece_count":int(src["num_parts"]) if src.get("num_parts") else None,
          "theme":theme_names.get(int(src["theme_id"]),"Unknown"),"rebrickable_set_num":src["set_num"],
          "rebrickable_theme_id":int(src["theme_id"]),"catalog_source":"Rebrickable","catalog_updated_at":stamp})
    for i in range(0,len(updates),200):
        sb("lego_sets?on_conflict=set_number",method="POST",body=updates[i:i+200],extra={"Prefer":"resolution=merge-duplicates,return=minimal"})
    print(json.dumps({"rebrickable_sets":len(sets),"brickcircle_rows":len(existing),"updated":len(updates),"unmatched":missing[:25]},indent=2))

if __name__=="__main__":
    try: main()
    except Exception as exc:
        print(f"catalog sync failed: {exc}",file=sys.stderr); raise
