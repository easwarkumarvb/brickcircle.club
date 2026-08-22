import argparse, random, uuid
from psycopg import connect

POPULARITY = [1,1,1,2,2,3,3,4,5,6,8,10,12,15,20]

def weighted_set(rng, n):
    # Zipf-like skew: popular sets are selected more often.
    rank = rng.choice(POPULARITY)
    return f"{min(n, max(1, int(rng.expovariate(1/rank)))):05d}"

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--users',type=int,default=100000)
    p.add_argument('--sets',type=int,default=10000)
    p.add_argument('--collection-per-user',type=int,default=50)
    p.add_argument('--wishlist-per-user',type=int,default=50)
    p.add_argument('--dsn',default='postgresql://brickcircle:brickcircle@localhost:55432/brickcircle_loadtest')
    a=p.parse_args(); rng=random.Random(42)
    with connect(a.dsn) as c:
      with c.cursor() as cur:
        cur.execute(open('schema.sql').read())
        cur.execute('truncate collection_items,wishlists,profiles,lego_sets cascade')
        cur.executemany('insert into lego_sets(set_number,name,theme,year,piece_count) values(%s,%s,%s,%s,%s)',[(f'{i:05d}',f'Synthetic LEGO Set {i}',rng.choice(['Technic','Icons','Star Wars','Ideas','City']),rng.randint(1977,2025),rng.randint(50,6000)) for i in range(1,a.sets+1)])
        users=[]
        for _ in range(a.users):
          u=uuid.uuid4(); users.append(u)
        cur.executemany('insert into profiles(id,username,display_name) values(%s,%s,%s)',[(u,f'u_{i}',f'Collector {i}') for i,u in enumerate(users)])
        collections=[]; wishes=[]
        for u in users:
          cs=set(); ws=set()
          while len(cs)<min(a.collection_per_user,a.sets): cs.add(weighted_set(rng,a.sets))
          while len(ws)<min(a.wishlist_per_user,a.sets): ws.add(weighted_set(rng,a.sets))
          collections += [(uuid.uuid4(),u,s,rng.random()<.75) for s in cs]
          wishes += [(uuid.uuid4(),u,s,rng.randint(1,5)) for s in ws]
          if len(collections)>=10000:
            cur.executemany('insert into collection_items(id,user_id,set_number,available_for_exchange) values(%s,%s,%s,%s) on conflict do nothing',collections); collections=[]
          if len(wishes)>=10000:
            cur.executemany('insert into wishlists(id,user_id,set_number,priority) values(%s,%s,%s,%s) on conflict do nothing',wishes); wishes=[]
        if collections: cur.executemany('insert into collection_items(id,user_id,set_number,available_for_exchange) values(%s,%s,%s,%s) on conflict do nothing',collections)
        if wishes: cur.executemany('insert into wishlists(id,user_id,set_number,priority) values(%s,%s,%s,%s) on conflict do nothing',wishes)
      c.commit()
    print(f'Generated {a.users:,} users, {a.sets:,} sets, ~{a.users*a.collection_per_user:,} collection rows and ~{a.users*a.wishlist_per_user:,} wishlist rows.')
if __name__=='__main__': main()
