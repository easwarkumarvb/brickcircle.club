# BrickCircle 100K-user scalability harness

This harness is isolated from production. It generates a realistic synthetic PostgreSQL dataset and benchmarks the Collection → Wishlist → reciprocal Match workload.

## Safety

**Never point the harness at production Supabase.** Use a local PostgreSQL container or a disposable database.

## Quick start

Requirements: Docker, Python 3.11+, and `psycopg`.

```bash
cd loadtest
docker compose up -d
python -m pip install -r requirements.txt
python generate.py --users 100000 --sets 10000 --collection-per-user 50 --wishlist-per-user 50
python benchmark.py --users 100000 --concurrency 100
```

For a quick smoke test:

```bash
python generate.py --users 1000 --sets 1000 --collection-per-user 20 --wishlist-per-user 20
python benchmark.py --users 1000 --concurrency 20
```

## What it measures

- synthetic profiles, collections and wishlists
- reciprocal matching for a user
- indexed lookup performance
- p50 / p95 / p99 latency
- throughput and errors
- `EXPLAIN (ANALYZE, BUFFERS)` for the critical reciprocal query

The generator intentionally creates popular-set skew rather than uniform random ownership, which better approximates a collector marketplace.
