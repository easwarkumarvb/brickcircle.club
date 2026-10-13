-- BrickCircle V2.5 beta hardening
-- Supported-country / major-city beta, canonical city matching, overdue return escalation.

create or replace function public.normalize_beta_city(p_country text, p_city text)
returns text language plpgsql immutable as $$
declare c text:=trim(coalesce(p_city,'')); country text:=lower(trim(coalesce(p_country,'')));
begin
 if c='' then return null; end if;
 if country='india' then
  if lower(c) in ('bangalore','bengaluru') then return 'Bengaluru'; end if;
  if lower(c) in ('bombay','mumbai') then return 'Mumbai'; end if;
  if lower(c) in ('calcutta','kolkata') then return 'Kolkata'; end if;
  if lower(c) in ('madras','chennai') then return 'Chennai'; end if;
  if lower(c) in ('mysore','mysuru') then return 'Mysuru'; end if;
  if lower(c) in ('trivandrum','thiruvananthapuram') then return 'Thiruvananthapuram'; end if;
  if lower(c) in ('cochin','kochi') then return 'Kochi'; end if;
 elsif country in ('united states','usa','us') then
  if lower(c) in ('new york city','nyc','new york') then return 'New York'; end if;
  if lower(c) in ('washington dc','washington, dc','washington, d.c.','dc') then return 'Washington, D.C.'; end if;
 elsif country='united kingdom' and lower(c)='londonderry' then return 'Derry';
 end if;
 return c;
end $$;

create or replace function public.normalize_profile_beta_location()
returns trigger language plpgsql as $$
begin
 new.country:=nullif(trim(new.country),'');
 new.city:=public.normalize_beta_city(new.country,new.city);
 return new;
end $$;

drop trigger if exists trg_normalize_profile_beta_location on public.profiles;
create trigger trg_normalize_profile_beta_location before insert or update of country,city on public.profiles for each row execute function public.normalize_profile_beta_location();
update public.profiles set city=public.normalize_beta_city(country,city) where city is not null;

-- Matching and acceptance use canonical city values so legacy aliases cannot split one local club.
create or replace function public.find_matches(p_user uuid)
returns table(match_user uuid, offered_item uuid, offered_set text, offered_name text, offered_value numeric, requested_item uuid, requested_set text, requested_name text, requested_value numeric, match_score integer)
language sql security definer set search_path=public as $$
 select c2.user_id,c1.id,c1.set_number,l1.name,coalesce(c1.estimated_value,l1.estimated_value,0),c2.id,c2.set_number,l2.name,coalesce(c2.estimated_value,l2.estimated_value,0),greatest(50,least(99,70+case when abs(coalesce(c1.estimated_value,l1.estimated_value,0)-coalesce(c2.estimated_value,l2.estimated_value,0))<=greatest(25,coalesce(c2.estimated_value,l2.estimated_value,0)*0.15) then 15 else 0 end+case when l1.theme=l2.theme then 10 else 0 end))
 from public.collection_items c1 join public.lego_sets l1 on l1.set_number=c1.set_number join public.profiles p1 on p1.id=c1.user_id join public.collection_items c2 on c2.available_for_exchange=true and c2.user_id<>p_user join public.profiles p2 on p2.id=c2.user_id join public.lego_sets l2 on l2.set_number=c2.set_number join public.wishlists w1 on w1.user_id=p_user and w1.set_number=c2.set_number join public.wishlists w2 on w2.user_id=c2.user_id and w2.set_number=c1.set_number
 where p_user=auth.uid() and c1.user_id=p_user and c1.available_for_exchange=true and public.normalize_beta_city(p1.country,p1.city)=public.normalize_beta_city(p2.country,p2.city) and lower(trim(coalesce(p1.country,'')))=lower(trim(coalesce(p2.country,'')));
$$;

alter table public.exchanges add column if not exists overdue_notified_at_a timestamptz;
alter table public.exchanges add column if not exists overdue_notified_at_b timestamptz;

create or replace function public.check_my_overdue_returns()
returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid();n integer:=0;e public.exchanges%rowtype;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 for e in select * from public.exchanges where state='swap_active' and return_due_at is not null and return_due_at<now() and me in(user_a,user_b) for update loop
  if me=e.user_a and e.overdue_notified_at_a is null then
   insert into public.notifications(user_id,kind,title,body,created_at) values(me,'return_overdue','LEGO return overdue','This temporary swap is overdue. Contact the other collector and arrange the return. If the problem continues, report an overdue return issue.',now());
   update public.exchanges set overdue_notified_at_a=now(),updated_at=now() where id=e.id;n:=n+1;
  elsif me=e.user_b and e.overdue_notified_at_b is null then
   insert into public.notifications(user_id,kind,title,body,created_at) values(me,'return_overdue','LEGO return overdue','This temporary swap is overdue. Contact the other collector and arrange the return. If the problem continues, report an overdue return issue.',now());
   update public.exchanges set overdue_notified_at_b=now(),updated_at=now() where id=e.id;n:=n+1;
  end if;
 end loop;
 return jsonb_build_object('ok',true,'new_overdue_notifications',n);
end $$;

create or replace function public.report_overdue_return_issue(p_exchange_id uuid,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid();e public.exchanges%rowtype;other uuid;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found or me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 if e.state<>'swap_active' or e.return_due_at is null or e.return_due_at>=now() then raise exception 'This return is not overdue'; end if;
 other:=case when me=e.user_a then e.user_b else e.user_a end;
 update public.exchanges set state='disputed',updated_at=now() where id=e.id;
 update public.exchange_returns set status='issue',issue_a=case when me=e.user_a then coalesce(nullif(trim(p_note),''),'Return overdue / no-show') else issue_a end,issue_b=case when me=e.user_b then coalesce(nullif(trim(p_note),''),'Return overdue / no-show') else issue_b end,updated_at=now() where exchange_id=e.id;
 insert into public.notifications(user_id,kind,title,body,created_at) values(other,'return_dispute','Return issue reported','The other collector reported an overdue return issue. This swap is paused for resolution.',now());
 return jsonb_build_object('ok',true,'status','disputed');
end $$;

revoke all on function public.check_my_overdue_returns() from public;
grant execute on function public.check_my_overdue_returns() to authenticated;
revoke all on function public.report_overdue_return_issue(uuid,text) from public;
grant execute on function public.report_overdue_return_issue(uuid,text) to authenticated;
