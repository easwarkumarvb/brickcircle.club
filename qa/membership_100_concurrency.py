import os, uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
import psycopg

DSN=os.environ['DSN']

def insert_member(i:int):
    member_id=uuid.uuid4()
    with psycopg.connect(DSN) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "insert into public.profiles(id,display_name,email,country,city) values(%s,%s,%s,'India','Bengaluru') returning membership_ordinal,founding_member_number,early_member_number",
                (member_id,f'Synthetic Collector {i}',f'qa-{i}@example.invalid')
            )
            row=cur.fetchone()
        conn.commit()
    return row

with ThreadPoolExecutor(max_workers=20) as pool:
    results=[f.result() for f in as_completed([pool.submit(insert_member,i) for i in range(1,101)])]

ordinals=sorted(r[0] for r in results)
founding=sorted(r[1] for r in results if r[1] is not None)
early=[r[2] for r in results if r[2] is not None]
assert ordinals==list(range(1,101)), f'ordinal allocation failed: {ordinals[:5]}...{ordinals[-5:]}'
assert founding==list(range(1,101)), f'founding allocation failed: {founding[:5]}...{founding[-5:]}'
assert not early, f'first 100 unexpectedly received early membership: {early}'

with psycopg.connect(DSN) as conn:
    with conn.cursor() as cur:
        uid=uuid.uuid4()
        cur.execute("insert into public.profiles(id,display_name,email,country,city) values(%s,'Collector 101','qa-101@example.invalid','India','Bengaluru') returning membership_ordinal,founding_member_number,early_member_number",(uid,))
        ordinal,founder,early_no=cur.fetchone()
        assert ordinal==101 and founder is None and early_no==101, (ordinal,founder,early_no)
        cur.execute("select count(*),count(distinct membership_ordinal),min(membership_ordinal),max(membership_ordinal) from public.profiles")
        count,distinct_count,min_no,max_no=cur.fetchone()
        assert (count,distinct_count,min_no,max_no)==(101,101,1,101)
        cur.execute("select founding_claimed,founding_remaining,early_claimed,early_remaining,total_members,beta_free from public.bc_membership_status()")
        status=cur.fetchone()
        assert status==(100,0,1,899,101,True), status
    conn.commit()
print('PASS: 100 concurrent founding members allocated uniquely as #1-#100; member #101 became Early Member #101.')
