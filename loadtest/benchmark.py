import argparse, random, statistics, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from psycopg import connect

QUERY='''WITH mine AS (SELECT set_number FROM collection_items WHERE user_id=%s AND available_for_exchange),
want AS (SELECT set_number FROM wishlists WHERE user_id=%s),
targets AS (SELECT DISTINCT c.user_id FROM collection_items c JOIN mine m ON m.set_number=c.set_number WHERE c.user_id<>%s AND c.available_for_exchange),
reciprocal AS (SELECT t.user_id FROM targets t WHERE EXISTS (SELECT 1 FROM collection_items c JOIN want w ON w.set_number=c.set_number WHERE c.user_id=t.user_id AND c.available_for_exchange))
SELECT count(*) FROM reciprocal;'''

def one(dsn,u):
  t=time.perf_counter()
  with connect(dsn) as c:
    with c.cursor() as cur:
      cur.execute(QUERY,(u,u,u)); n=cur.fetchone()[0]
  return (time.perf_counter()-t)*1000,n

def main():
  p=argparse.ArgumentParser(); p.add_argument('--users',type=int,default=100000); p.add_argument('--concurrency',type=int,default=100); p.add_argument('--requests',type=int,default=1000); p.add_argument('--dsn',default='postgresql://brickcircle:brickcircle@localhost:55432/brickcircle_loadtest'); a=p.parse_args()
  with connect(a.dsn) as c:
    with c.cursor() as cur: cur.execute('select id from profiles order by random() limit %s',(a.requests,)); ids=[r[0] for r in cur.fetchall()]
    cur.execute('explain (analyze,buffers,format text) '+QUERY,(ids[0],ids[0],ids[0])); plan='\n'.join(r[0] for r in cur.fetchall())
  start=time.perf_counter(); vals=[]; errors=0
  with ThreadPoolExecutor(max_workers=a.concurrency) as ex:
    fs=[ex.submit(one,a.dsn,u) for u in ids]
    for f in as_completed(fs):
      try: vals.append(f.result()[0])
      except Exception as e: errors+=1; print('ERROR',e)
  elapsed=time.perf_counter()-start
  vals.sort(); n=len(vals)
  def pct(x): return vals[min(n-1,max(0,int(n*x)-1))] if n else None
  print('\nBrickCircle reciprocal-match benchmark')
  print(f'users={a.users:,} requests={a.requests:,} concurrency={a.concurrency}')
  print(f'throughput={len(vals)/elapsed:.1f} req/s errors={errors}')
  if vals: print(f'p50={statistics.median(vals):.1f}ms p95={pct(.95):.1f}ms p99={pct(.99):.1f}ms max={max(vals):.1f}ms')
  print('\nEXPLAIN ANALYZE:'); print(plan)
if __name__=='__main__': main()
