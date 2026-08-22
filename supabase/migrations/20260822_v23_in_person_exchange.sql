-- BrickCircle V2.3: AFOL-first, in-person exchange workflow
create table if not exists public.exchange_meetups (
 id uuid primary key default gen_random_uuid(),
 exchange_id uuid not null references public.exchanges(id) on delete cascade unique,
 proposed_by uuid not null references auth.users(id),
 venue_name text,
 venue_area text,
 meetup_at timestamptz,
 safety_ack_a boolean not null default false,
 safety_ack_b boolean not null default false,
 arrived_a boolean not null default false,
 arrived_b boolean not null default false,
 inspected_a boolean not null default false,
 inspected_b boolean not null default false,
 confirmed_a boolean not null default false,
 confirmed_b boolean not null default false,
 issue_a text,
 issue_b text,
 status text not null default 'planning' check(status in ('planning','scheduled','meeting','inspection','completed','cancelled','issue')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.exchange_meetups enable row level security;
create policy "participants read meetup" on public.exchange_meetups for select to authenticated using(exists(select 1 from public.exchanges e where e.id=exchange_id and auth.uid() in(e.user_a,e.user_b)));
create index if not exists idx_exchange_meetups_exchange on public.exchange_meetups(exchange_id,status);

create or replace function public.setup_meetup(p_exchange_id uuid,p_venue_name text,p_venue_area text,p_meetup_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.exchanges%rowtype; me uuid:=auth.uid(); m public.exchange_meetups%rowtype;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 select * into e from public.exchanges where id=p_exchange_id;
 if not found or me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 if e.state in ('completed','cancelled','disputed') then raise exception 'Exchange is closed'; end if;
 if p_meetup_at<=now() then raise exception 'Choose a future meeting time'; end if;
 insert into public.exchange_meetups(exchange_id,proposed_by,venue_name,venue_area,meetup_at,status)
 values(e.id,me,nullif(trim(p_venue_name),''),nullif(trim(p_venue_area),''),p_meetup_at,'scheduled')
 on conflict(exchange_id) do update set proposed_by=me,venue_name=excluded.venue_name,venue_area=excluded.venue_area,meetup_at=excluded.meetup_at,status='scheduled',updated_at=now()
 returning * into m;
 insert into public.notifications(user_id,kind,title,body,created_at) values(case when me=e.user_a then e.user_b else e.user_a end,'meetup_proposed','Meetup proposed','Your collector proposed a public meetup for this exchange.',now());
 return jsonb_build_object('ok',true,'meetup_id',m.id);
end $$;

create or replace function public.meetup_action(p_exchange_id uuid,p_action text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.exchanges%rowtype; m public.exchange_meetups%rowtype; me uuid:=auth.uid(); isa boolean; done boolean;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found or me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 select * into m from public.exchange_meetups where exchange_id=e.id for update;
 if not found then raise exception 'Schedule a meetup first'; end if;
 isa:=me=e.user_a;
 if p_action='safety_ack' then
  if isa then update public.exchange_meetups set safety_ack_a=true,updated_at=now() where id=m.id; else update public.exchange_meetups set safety_ack_b=true,updated_at=now() where id=m.id; end if;
 elsif p_action='arrived' then
  if isa then update public.exchange_meetups set arrived_a=true,status='meeting',updated_at=now() where id=m.id; else update public.exchange_meetups set arrived_b=true,status='meeting',updated_at=now() where id=m.id; end if;
 elsif p_action='inspected' then
  if isa then update public.exchange_meetups set inspected_a=true,status='inspection',updated_at=now() where id=m.id; else update public.exchange_meetups set inspected_b=true,status='inspection',updated_at=now() where id=m.id; end if;
 elsif p_action='confirm' then
  if isa then update public.exchange_meetups set confirmed_a=true,updated_at=now() where id=m.id; else update public.exchange_meetups set confirmed_b=true,updated_at=now() where id=m.id; end if;
 elsif p_action='issue' then
  if isa then update public.exchange_meetups set issue_a=nullif(trim(p_note),''),status='issue',updated_at=now() where id=m.id; else update public.exchange_meetups set issue_b=nullif(trim(p_note),''),status='issue',updated_at=now() where id=m.id; end if;
 else raise exception 'Invalid meetup action'; end if;
 select * into m from public.exchange_meetups where id=m.id;
 done:=m.confirmed_a and m.confirmed_b and m.inspected_a and m.inspected_b;
 if done then
  update public.exchange_meetups set status='completed',updated_at=now() where id=m.id;
  update public.exchanges set state='completed',completed_at=now(),updated_at=now() where id=e.id;
  insert into public.notifications(user_id,kind,title,body,created_at) values
   (e.user_a,'meetup_completed','Exchange completed','Both collectors inspected and confirmed the in-person exchange. You can now review each other.',now()),
   (e.user_b,'meetup_completed','Exchange completed','Both collectors inspected and confirmed the in-person exchange. You can now review each other.',now());
 end if;
 return jsonb_build_object('ok',true,'completed',done,'status',case when done then 'completed' else m.status end);
end $$;
revoke all on function public.setup_meetup(uuid,text,text,timestamptz) from public;
grant execute on function public.setup_meetup(uuid,text,text,timestamptz) to authenticated;
revoke all on function public.meetup_action(uuid,text,text) from public;
grant execute on function public.meetup_action(uuid,text,text) to authenticated;