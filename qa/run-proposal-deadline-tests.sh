#!/usr/bin/env bash
# Disposable PostgreSQL only. Requires PostgreSQL 15 binaries and pg_cron package.
set -euo pipefail
export PGHOST=/tmp/brickcircle-deadline-socket PGPORT=55439 PGDATABASE=postgres
pg_bin="$(pg_config --bindir)"
if [[ -e /tmp/brickcircle-deadline-pg ]]; then
  echo 'Disposable cluster already exists; use its existing connection or remove it explicitly before this runner.' >&2
  exit 1
fi
mkdir -p "$PGHOST"
"$pg_bin/initdb" -D /tmp/brickcircle-deadline-pg -A trust > /tmp/brickcircle-deadline-init.log
"$pg_bin/pg_ctl" -D /tmp/brickcircle-deadline-pg -l /tmp/brickcircle-deadline-pg.log -o "-p $PGPORT -k $PGHOST -c shared_preload_libraries=pg_cron -c cron.database_name=postgres" start
trap '"$pg_bin/pg_ctl" -D /tmp/brickcircle-deadline-pg stop -m fast' EXIT
psql -X -v ON_ERROR_STOP=1 -f qa/canonical_exchange_state_machine_base.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/20260916052934_canonical_exchange_state_machine.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261019030051_reject_expired_exchange_counters.sql
psql -X -v ON_ERROR_STOP=1 -c 'create extension pg_cron'
psql -X -1 -v ON_ERROR_STOP=1 -f supabase/migrations/20261103064244_deadline_delivery_validation.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/expired_exchange_counter.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/proposal_deadlines_resend.sql
python3 qa/proposal_deadline_race_test.py
