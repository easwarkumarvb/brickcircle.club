#!/usr/bin/env python3
"""Make Rebrickable's daily official-set export BrickCircle's catalogue backbone.

Safety: validates downloads, upserts in bounded batches, never deletes catalogue rows,
never touches BrickCircle valuation/community fields, and marks disappeared source rows
inactive only after a successful import.
"""
import csv, gzip, io, json, os, sys, urllib.request
from datetime import datetime, timezone

SUPABASE_URL=os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_KEY=os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SETS_URL="https://cdn.rebrickable.com/media/downloads/sets.csv.gz"
THEMES_URL="https://cdn.rebrickable.com/media/downloads/themes.csv.gz"
BATCH=250

def download_csv(url):
    req=urllib.request.Request(url,headers={"User-Agent":"BrickCircle-Catalog-Sync/2.0"})
    with urllib.request.urlopen(req,timeout=90) as r: raw=r.read()
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz:
        return list(csv.DictReader(io.TextIOWrapper(gz,encoding="utf-8")))

def sb(path,method="GET",body=None,extra=None):
    h={"apikey":SERVICE_KEY,"Authorization":f"Bearer {SERVICE_KEY}","Content-Type":"application/json"}
    if extra: h.update(extra)
    req=urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}",data=json.dumps(body).encode() if body is not None else None,headers=h,method=method)
    with urllib.request.urlopen(req,timeout=90) as r:
        p=r.read(); return json.loads(p) if p else None

def main():
    sets=download_csv(SETS_URL); themes=download_csv(THEMES_URL)
    if len(sets)<10000 or len(themes)<100:
        raise RuntimeError(f"Rebrickable export validation failed: {len(sets)} sets/{len(themes)} themes")
    required={"set_num","name","year","theme_id","num_parts"}
    if not sets or not required.issubset(sets[0]): raise RuntimeError("Unexpected Rebrickable sets schema")
    theme_names={int(t["id"]):t["name"] for t in themes}
    stamp=datetime.now(timezone.utc).isoformat()
    rows=[]
    for s in sets:
        rows.append({
          "set_number":s["set_num"],"name":s["name"],"year":int(s["year"]) if s.get("year") else None,
          "piece_count":int(s["num_parts"]) if s.get("num_parts") else None,
          "theme":theme_names.get(int(s["theme_id"]),"Unknown"),"rebrickable_set_num":s["set_num"],
          "rebrickable_theme_id":int(s["theme_id"]),"catalog_source":"Rebrickable",
          "catalog_active":True,"catalog_updated_at":stamp})
    # Import all official-set records. Conflict handling preserves columns omitted above,
    # including estimated_value and future BrickCircle demand/exchange intelligence.
    for i in range(0,len(rows),BATCH):
        sb("lego_sets?on_conflict=set_number",method="POST",body=rows[i:i+BATCH],
           extra={"Prefer":"resolution=merge-duplicates,return=minimal"})
        if i and i%5000==0: print(f"upserted {i}/{len(rows)}")
    # Only after the complete validated upsert, retire Rebrickable records not seen today.
    # Never DELETE: member collections/wishlists and historical exchanges remain referentially safe.
    sb(f"lego_sets?catalog_source=eq.Rebrickable&catalog_updated_at=lt.{stamp}",method="PATCH",
       body={"catalog_active":False})
    print(json.dumps({"source_sets":len(sets),"upserted":len(rows),"source":"Rebrickable","completed_at":stamp},indent=2))

if __name__=="__main__":
    try: main()
    except Exception as exc:
        print(f"catalog sync failed safely: {exc}",file=sys.stderr); raise
