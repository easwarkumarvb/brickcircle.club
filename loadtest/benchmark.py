import argparse, statistics, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from psycopg import connect

QUERY='''WITH mine AS (SELECT set_number FROM collection_items WHERE user_id=%s AND available_for_exchange),
want AS (SELECT set_number FROM wishlists WHERE user_id=%s),
targets AS (SELECT DISTINCT c.user_id FROM collection_items c JOIN mine m ON m.set_number=c.set_number WHERE c.user_id<>%s AND c.available_for_exchange),
reciprocal AS (SELECT t.user_id FROM targets t WHERE EXISTS (SELECT 1 FROM collection_items c JOIN want w ON w.set_number=c.set_number WHERE c.user_id=t.user_id AND c.available_for_exchange))
SELECT count(*) FROM reciprocal;'''

def one(dsn,u):
  t=time.perf_counter()
  with connect(dsn, connect_timeout=10) as c:
    with c.cursor() as cur:
      cur.execute(QUERY,(u,u,u)); n=cur.fetchone()[0]
  return (time.perf_counter()-t)*1000,n

def main():
  p=argparse.ArgumentParser()
  p.add_argument('--users',type=int,default=100000)
  p.add_argument('--concurrency',type=int,default=100)
  p.add_argument('--requests',type=int,default=1000)
  p.add_argument('--dsn',default='postgresql://brickcircle:brickcircle@localhost:55432/brickcircle_loadtest')
  a=p.parse_args()
  if a.concurrency < 1 or a.requests < 1:
    raise SystemExit('concurrency and requests must be >= 1')

  with connect(a.dsn) as c:
    with c.cursor() as cur:
      cur.execute('select count(*) from profiles')
      actual_users=cur.fetchone()[0]
      if actual_users < 1:
        raise SystemExit('Benchmark aborted: profiles table is empty')
      if actual_users != a.users:
        raise SystemExit(f'Benchmark aborted: expected {a.users:,} profiles but found {actual_users:,}')
      cur.execute('select id from profiles order by random() limit %s',(min(a.requests,actual_users),))
      ids=[r[0] for r in cur.fetchall()]
      if not ids:
        raise SystemExit('Benchmark aborted: no user IDs available')
      cur.execute('explain (analyze,buffers,format text) '+QUERY,(ids[0],ids[0],ids[0]))
      plan='\n'.join(r[0] for r in cur.fetchall())

  start=time.perf_counter(); vals=[]; match_counts=[]; errors=[]
  with ThreadPoolExecutor(max_workers=a.concurrency) as ex:
    fs=[ex.submit(one,a.dsn,u) for u in ids]
    for f in as_completed(fs):
      try:
        ms,n=f.result(); vals.append(ms); match_counts.append(n)
      except Exception as e:
        errors.append(repr(e))
  elapsed=time.perf_counter()-start
  vals.sort(); n=len(vals)
  def pct(x): return vals[min(n-1,max(0,int(n*x)-1))] if n else None

  print('\nBrickCircle reciprocal-match benchmark')
  print(f'users={actual_users:,} requests={len(ids):,} concurrency={a.concurrency}')
  print(f'completed={len(vals):,} errors={len(errors):,} elapsed={elapsed:.2f}s')
  print(f'throughput={len(vals)/elapsed:.1f} req/s' if elapsed else 'throughput=n/a')
  if vals:
    print(f'p50={statistics.median(vals):.1f}ms p95={pct(.95):.1f}ms p99={pct(.99):.1f}ms max={max(vals):.1f}ms')
    print(f'matches median={statistics.median(match_counts):.1f} max={max(match_counts)}')
  if errors:
    for e in errors[:20]: print('ERROR',e)
    raise SystemExit(f'Benchmark failed with {len(errors)} request errors')
  print('\nEXPLAIN ANALYZE:')
  print(plan)
  print('\nBenchmark PASS')

if __name__=='__main__': main()
