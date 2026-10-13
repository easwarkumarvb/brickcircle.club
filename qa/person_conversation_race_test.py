"""Disposable PostgreSQL CI only: real concurrent sessions, no hosted connection."""
import os, subprocess, time
DSN = os.environ['DSN']
assert '@127.0.0.1:5432/conversation_read_model' in DSN, 'Only disposable loopback CI target'
A='00000000-0000-4000-8000-000000000201'
B='00000000-0000-4000-8000-000000000202'
def run(sql):
    return subprocess.run(['psql', DSN, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], check=True, capture_output=True, text=True).stdout.strip()
def pair_lock():
    return f"select 1 from public.collector_conversation_summaries where user_id='{A}' and peer_id='{B}' for update;"
def mark_latest():
    return f"set local role authenticated; set local \"request.jwt.claim.sub\"='{A}'; select public.mark_collector_conversation_read('{B}',f.occurred_at,f.source_type,f.source_id) from public.collector_conversation_feed('{B}',null,null,null,1) f;"
def incoming(mid,stamp):
    return f"set local \"request.jwt.claim.sub\"='{B}'; insert into public.messages(id,sender_id,recipient_id,body,created_at) values('{mid}','{B}','{A}','Concurrent incoming','{stamp}');"
def session(sql):
    return subprocess.Popen(['psql', DSN, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
def wait_locked(pid):
    # Wait for observed pg_sleep in the first session, not an arbitrary client delay.
    for _ in range(100):
        if run(f"select count(*) from pg_stat_activity where datname='conversation_read_model' and state='active' and wait_event='PgSleep' and query like '%pg_sleep(2)%' and pid<>pg_backend_pid();")!='0':
            return
        time.sleep(.02)
    raise RuntimeError('Concurrent test lock holder did not start')
def finish(p):
    out,err=p.communicate(timeout=15)
    assert p.returncode==0, err
# Read commits first. Incoming insert waits for summary lock then increments.
p=session('begin;'+pair_lock()+mark_latest()+'select pg_sleep(2); commit;')
wait_locked(p.pid)
q=session('begin;'+incoming('71000000-0000-4000-8000-000000000001','2026-10-03')+'commit;')
finish(p);finish(q)
assert run(f"select unread_count from public.collector_conversation_summaries where user_id='{A}' and peer_id='{B}';")=='1'
# Incoming commits first. A read of an earlier durable tuple still counts it.
p=session('begin;'+incoming('71000000-0000-4000-8000-000000000002','2026-10-04')+'select pg_sleep(2); commit;')
wait_locked(p.pid)
q=session(f"begin; set local role authenticated; set local \"request.jwt.claim.sub\"='{A}'; select public.mark_collector_conversation_read('{B}',created_at,'direct_message',id) from public.messages where id='71000000-0000-4000-8000-000000000001'; commit;")
finish(p);finish(q)
assert run(f"select unread_count from public.collector_conversation_summaries where user_id='{A}' and peer_id='{B}';")=='1'
print('Both real concurrent lock orders preserve exact unread count.')
# Two different canonical cases sharing one person conversation must count only
# after acquiring both summary locks. These are isolated bookkeeping fixtures;
# custody/lifecycle validation remains covered by canonical RPC suites.
run(f"""
insert into public.lego_sets(set_number,name) values('read-race-1','Read race one'),('read-race-2','Read race two'),('read-race-3','Read race three'),('read-race-4','Read race four');
insert into public.collection_items(id,user_id,set_number) values
('72000000-0000-4000-8000-000000000001','{A}','read-race-1'),
('72000000-0000-4000-8000-000000000002','{B}','read-race-2'),
('72000000-0000-4000-8000-000000000003','{A}','read-race-3'),
('72000000-0000-4000-8000-000000000004','{B}','read-race-4');
""")
def case_insert(cid,ia,ib):
    return f"insert into public.exchange_cases(id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,owner_preference_a,owner_preference_b) values('{cid}','{A}','{B}','{ia}','{ib}','{A}','{B}',30,'PROPOSED',true,true);"
C1='73000000-0000-4000-8000-000000000001'
C2='73000000-0000-4000-8000-000000000002'
p=session('begin;'+case_insert(C1,'72000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000002')+'select pg_sleep(2);commit;')
wait_locked(p.pid)
q=session('begin;'+case_insert(C2,'72000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000004')+'commit;')
finish(p);finish(q)
assert run(f"select active_case_count from public.collector_conversation_summaries where user_id='{A}' and peer_id='{B}';")=='2'
p=session(f"begin;update public.exchange_cases set state='CANCELLED' where id='{C1}';select pg_sleep(2);commit;")
wait_locked(p.pid)
q=session(f"begin;update public.exchange_cases set state='ACCEPTED' where id='{C2}';commit;")
finish(p);finish(q)
assert run(f"select active_case_count from public.collector_conversation_summaries where user_id='{A}' and peer_id='{B}';")=='1'
assert run(f"select active_case_count from public.collector_conversation_summaries where user_id='{B}' and peer_id='{A}';")=='1'
print('Concurrent distinct-case creation and close/accept preserve both participant counts.')
