"""Real concurrent resend transactions; only the explicitly disposable local cluster."""
import os, subprocess, time
from pathlib import Path
assert os.environ.get('PGHOST')=='/tmp/brickcircle-deadline-socket' and os.environ.get('PGPORT')=='55439', 'Disposable deadline cluster only'
def run(sql):
    return subprocess.run(['psql','postgres','-XAt','-v','ON_ERROR_STOP=1','-c',sql],capture_output=True,text=True,check=True).stdout.strip()
def start(sql):
    return subprocess.Popen(['psql','postgres','-XAt','-v','ON_ERROR_STOP=1','-c',sql],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
def finish(p):
    out,err=p.communicate(timeout=12)
    assert p.returncode==0,err
    return out
A='00000000-0000-4000-8000-000000000058'
seed=Path('supabase/tests/proposal_deadlines_resend.sql').read_text()
seed=seed[seed.index('create temporary table counter_test_context'):seed.index('create function pg_temp.assert_true')]
run('begin;'+seed+"update public.exchange_cases set response_deadline=now()-interval '1 day';commit;")
case=run("select id from public.exchange_cases where opening_message='Expired counter test';")
if not case:
    case=run(f"select id from public.exchange_cases where user_a='{A}' limit 1;")
def call(cid,key,version='1'):
    return f"set local \"request.jwt.claim.sub\"='{A}';select public.resend_exchange_case_invite('{cid}',{version},'{key}');"
def wait_sleep():
    for _ in range(100):
        if run("select count(*) from pg_stat_activity where wait_event='PgSleep' and query like '%deadline-race-hold%';")!='0': return
        time.sleep(.02)
    raise AssertionError('lock holder not observed')
p=start('begin;'+call(case,'race-replay')+"select pg_sleep(2) /* deadline-race-hold */;commit;")
wait_sleep();q=start('begin;'+call(case,'race-replay')+'commit;')
finish(p);assert '"idempotent": true' in finish(q)
assert run(f"select count(*) from public.exchange_case_events where case_id='{case}' and event_type='proposal_resent';")=='1'
assert run(f"select count(*) from public.notifications where exchange_case_id='{case}' and title='Exchange invite resent';")=='1'
# Expired historical case and a second historical case share the same physical sets.
run(f"update public.exchange_cases set response_deadline=now()-interval '1 day' where id='{case}';select public.expire_exchange_cases(100);")
clone='76000000-0000-4000-8000-000000000001'
run(f"insert into public.exchange_cases(id,user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,state,response_deadline,owner_preference_a,owner_preference_b) select '{clone}',user_a,user_b,item_a,item_b,proposer_id,recipient_id,duration_days,'EXPIRED',response_deadline,owner_preference_a,owner_preference_b from public.exchange_cases where id='{case}';")
version=run(f"select state_version from public.exchange_cases where id='{case}';")
p=start('begin;'+call(case,'race-winner',version)+"select pg_sleep(2) /* deadline-race-hold */;commit;")
wait_sleep();q=start('begin;'+call(clone,'race-loser')+'commit;')
finish(p);out,err=q.communicate(timeout=12)
assert q.returncode!=0 and ('already participating' in err or 'active invite' in err),err
assert run(f"select count(*) from public.exchange_case_item_locks where case_id='{case}';")=='2'
assert run(f"select state from public.exchange_cases where id='{clone}';")=='EXPIRED'
print('PASS: concurrent replay notifies once; conflicting historical resends retain one active invite and two winner locks.')
