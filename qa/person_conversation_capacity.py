"""Disposable local PostgreSQL17 benchmark; never connects to Supabase or providers."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import statistics
import subprocess
import time
from urllib.parse import urlparse

SHA = '614c05d5d92d1beb6929bbc9d1445bb0796ba08d'
OWNER = '90000000-0000-4000-8000-000000000001'
DENSE = '90000000-0000-4000-8000-000000000002'
OUTSIDER = '90000000-0000-4000-8000-000000000099'
parser = argparse.ArgumentParser()
parser.add_argument('--candidate', required=True)
args = parser.parse_args()
candidate = Path(args.candidate).resolve()
dsn = os.environ['DSN']
target = urlparse(dsn)
assert target.scheme == 'postgresql' and target.hostname in ('127.0.0.1', 'localhost')
assert target.path == '/projection_capacity', 'Only the disposable service database is allowed'
assert subprocess.check_output(['git', '-C', str(candidate), 'rev-parse', 'HEAD'], text=True).strip() == SHA
out = Path('artifacts/projection-capacity')
out.mkdir(parents=True, exist_ok=True)
report = {'candidate': SHA, 'status': 'running', 'timings': {}, 'plans': {}, 'limitations': [
    'Synthetic service-local PostgreSQL17; not Supabase hardware, HTTP latency, pooler, Auth or Realtime.',
    '10,000 additional direct messages, 61 owner pairs and a 4,000-message dense pair; existing minimal canonical fixtures also remain.',
    'Mixed case/event cardinality is only the existing canonical seed; this is not a million-row or realistic body-size benchmark.',
    'Warm-cache samples include function execution/planning; wall timings additionally include psql startup.',
    'Lock-mode probe is a separate controlled transaction; its intentional hold is not included in migration timing.',
    'No production SLO, concurrent throughput, memory-pressure or physical-phone certification is implied.'
]}

def save():
    (out / 'report.json').write_text(json.dumps(report, indent=2) + '\n')

def psql(sql='', file=None, application='capacity-read', check=True):
    command = ['psql', dsn, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1']
    if file:
        command.extend(['-f', str(file)])
    else:
        command.extend(['-c', sql])
    return subprocess.run(command, capture_output=True, text=True, timeout=120,
                          env={**os.environ, 'PGAPPNAME': application}, check=check)

def auth(sql, actor=OWNER):
    return "set statement_timeout='30s';set role authenticated;set \"request.jwt.claim.sub\"='" + actor + "';" + sql

def rows(query, actor=OWNER):
    return json.loads(psql(auth('select coalesce(json_agg(t),\'[]\'::json) from (' + query + ') t;', actor)).stdout)

def literal(value):
    return "'" + str(value).replace("'", "''") + "'"

def observe_locks(application):
    return json.loads(psql("select coalesce(json_agg(t),'[]'::json) from (select c.relname,l.mode,l.granted from pg_locks l join pg_stat_activity a on a.pid=l.pid join pg_class c on c.oid=l.relation where a.application_name=" + literal(application) + " and c.relname in('messages','exchange_cases','exchange_case_messages','exchange_case_events')) t;").stdout)

try:
    report['postgres_version'] = psql('select version();').stdout.strip()
    assert psql("select current_setting('server_version_num')::int/10000;").stdout.strip() == '17'
    for f in ['qa/canonical_exchange_state_machine_base.sql', 'qa/canonical_exchange_state_machine_legacy_seed.sql',
              'supabase/migrations/20260916052934_canonical_exchange_state_machine.sql', 'qa/person_conversation_setup.sql',
              'supabase/migrations/20261005173802_guided_exchange_messaging.sql']:
        psql(file=candidate / f)
    seed = f"""
    insert into auth.users(id,email)
    select ('90000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'capacity-'||n||'@example.test' from generate_series(1,62) n;
    insert into auth.users values('{OUTSIDER}','capacity-outsider@example.test');
    insert into public.profiles(id,display_name,adult_confirmed_at)
    select id,'Synthetic capacity collector',now() from auth.users where id::text like '90000000-%';
    set "request.jwt.claim.sub"='{OWNER}';
    insert into public.messages(id,sender_id,recipient_id,body,created_at)
    select ('91000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
      case when n%2=0 then '{OWNER}'::uuid else peer end,
      case when n%2=0 then peer else '{OWNER}'::uuid end,
      'Synthetic local capacity message '||n,'2026-10-01'::timestamptz+n*interval '1 microsecond'
    from (select n,('90000000-0000-4000-8000-'||lpad((case when n<=4000 then 2 else 3+(n-4001)%60 end)::text,12,'0'))::uuid peer from generate_series(1,10000) n) s;
    """
    started = time.perf_counter();psql(seed);report['timings']['seed_wall_ms'] = (time.perf_counter()-started)*1000
    migration = candidate / 'supabase/migrations/20261012083443_person_first_conversation_projection.sql'
    report['migration_sha256'] = hashlib.sha256(migration.read_bytes()).hexdigest()
    command = ['psql', dsn, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', str(migration)]
    started = time.perf_counter()
    proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                            env={**os.environ, 'PGAPPNAME': 'capacity-migration'})
    locks = []
    while proc.poll() is None:
        locks.extend(observe_locks('capacity-migration'));time.sleep(.05)
        assert time.perf_counter()-started < 120, 'Migration exceeded 120s capacity limit'
    stdout, stderr = proc.communicate()
    (out / 'migration.log').write_text(stdout + stderr)
    assert proc.returncode == 0, stderr
    report['timings']['transactional_migration_wall_ms'] = (time.perf_counter()-started)*1000
    report['migration_observed_locks'] = sorted({(r['relname'],r['mode'],r['granted']) for r in locks})
    psql('analyze;')
    cardinality = json.loads(psql("select json_build_object('source_messages',(select count(*) from public.messages),'entries',(select count(*) from public.collector_conversation_entries),'summaries',(select count(*) from public.collector_conversation_summaries),'synthetic_messages',(select count(*) from public.messages where id::text like '91000000-%'),'owner_entries',(select count(*) from public.collector_conversation_entries where user_id='"+OWNER+"'),'owner_summaries',(select count(*) from public.collector_conversation_summaries where user_id='"+OWNER+"'),'dense_entries',(select count(*) from public.collector_conversation_entries where user_id='"+OWNER+"' and peer_id='"+DENSE+"'));").stdout)
    report['cardinalities'] = cardinality
    assert cardinality['synthetic_messages'] == cardinality['owner_entries'] == 10000
    assert cardinality['owner_summaries'] == 61 and cardinality['dense_entries'] == 4000
    inbox = 'select * from public.list_collector_conversations(null,null,30)'
    feed = f"select * from public.collector_conversation_feed('{DENSE}',null,null,null,50)"
    first_i, first_f = rows(inbox), rows(feed)
    assert len(first_i) == 30 and len(first_f) == 50
    i, f = first_i[-1], first_f[-1]
    older_i = f"select * from public.list_collector_conversations({literal(i['last_at'])},{literal(i['peer_id'])},30)"
    older_f = f"select * from public.collector_conversation_feed('{DENSE}',{literal(f['occurred_at'])},{literal(f['source_type'])},{literal(f['source_id'])},50)"
    page_i, page_f = rows(older_i), rows(older_f)
    assert len(page_i) == 30 and len(page_f) == 50
    assert not set(r['peer_id'] for r in first_i) & set(r['peer_id'] for r in page_i)
    assert not set(r['source_id'] for r in first_f) & set(r['source_id'] for r in page_f)
    last = page_i[-1]
    assert len(rows(f"select * from public.list_collector_conversations({literal(last['last_at'])},{literal(last['peer_id'])},30)")) == 1
    assert rows(feed, OUTSIDER) == [] and rows('select * from public.collector_conversation_entries', OUTSIDER) == []
    assert len(rows('select * from public.collector_conversation_entries')) == 10000
    report['assertions'] = {'owner_rls': True, 'outsider_denied': True, 'inbox_pages': [30,30,1], 'feed_pages': [50,50], 'page_overlap': False}
    nested = "load 'auto_explain';set auto_explain.log_min_duration=0;set auto_explain.log_analyze=on;set auto_explain.log_buffers=on;set auto_explain.log_timing=off;set auto_explain.log_nested_statements=on;set auto_explain.log_format='json';set auto_explain.log_level='notice';set client_min_messages='notice';"
    for label, query in [('inbox30',inbox),('inbox30_cursor',older_i),('feed50_dense',feed),('feed50_cursor',older_f)]:
        execution, walls = [], []
        for n in range(5):
            started = time.perf_counter();result = psql(auth('explain (analyze,buffers,format json) '+query+';'));walls.append((time.perf_counter()-started)*1000)
            plan = json.loads(result.stdout);execution.append(plan[0]['Execution Time'])
            (out / f'{label}-sample-{n}.json').write_text(json.dumps(plan,indent=2)+'\n')
        result = psql(nested+auth(query+';'))
        (out / f'{label}-nested-plans.log').write_text(result.stderr)
        indexes = sorted(set(re.findall(r'"Index Name":\s*"([^"]+)"',result.stderr)))
        assert '"Plan"' in result.stderr and 'collector_conversation_entries' in result.stderr, 'Nested plan evidence missing'
        report['timings'][label] = {'execution_ms':execution,'median_execution_ms':statistics.median(execution),'max_execution_ms':max(execution),'wall_ms':walls}
        report['plans'][label] = {'top_level':'Function Scan; not sufficient to infer indexes','actual_nested_index_names':indexes,'raw_evidence':f'{label}-nested-plans.log'}
    # Separate bounded source-lock probe: compatible reads, incompatible writes.
    probe = subprocess.Popen(['psql',dsn,'-X','-q','-v','ON_ERROR_STOP=1','-c',"begin;lock table public.exchange_cases,public.messages,public.exchange_case_messages,public.exchange_case_events in share row exclusive mode;select pg_sleep(3);commit;"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env={**os.environ,'PGAPPNAME':'capacity-lock-probe'})
    observed=[];started=time.perf_counter()
    while not observed:
        observed=observe_locks('capacity-lock-probe');assert time.perf_counter()-started<2;time.sleep(.05)
    assert sum(r['mode']=='ShareRowExclusiveLock' and r['granted'] for r in observed)==4
    compatible=psql('set lock_timeout=\'250ms\';select count(*) from public.messages;')
    blocked=psql("set lock_timeout='250ms';update public.messages set body=body where id='ffffffff-ffff-ffff-ffff-ffffffffffff';",check=False)
    assert blocked.returncode != 0 and 'lock timeout' in blocked.stderr
    probe.communicate(timeout=10);assert probe.returncode==0
    report['lock_probe']={'source_locks':observed,'read_completed':compatible.returncode==0,'write_rejected_by_250ms_lock_timeout':True,'intentional_hold_seconds':3}
    report['status']='passed';save();print(json.dumps(report,indent=2))
except Exception as error:
    report['status']='failed';report['error']=str(error);save();raise
