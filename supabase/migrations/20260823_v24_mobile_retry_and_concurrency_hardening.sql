-- BrickCircle V2.4 mobile/field hardening.
-- Makes meetup scheduling idempotent on identical retries, serializes schedule/action updates,
-- rejects blank venues, blocks outbound scheduling after handoff, and makes terminal confirmations retry-safe.

create or replace function public.setup_meetup(p_exchange_id uuid,p_venue_name text,p_venue_area text,p_meetup_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.exchanges%rowtype; me uuid:=auth.uid(); m public.exchange_meetups%rowtype; same boolean:=false;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 if nullif(trim(p_venue_name),'') is null then raise exception 'Choose a public meetup venue'; end if;
 if p_meetup_at is null or p_meetup_at<=now() then raise exception 'Choose a future meeting time'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found or me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 if e.state<>'accepted' then raise exception 'Initial meetup scheduling is available only before the temporary swap handoff'; end if;
 select * into m from public.exchange_meetups where exchange_id=e.id for update;
 if found then
   same := coalesce(trim(m.venue_name),'')=trim(p_venue_name) and coalesce(trim(m.venue_area),'')=coalesce(trim(p_venue_area),'') and m.meetup_at=p_meetup_at;
   if same then return jsonb_build_object('ok',true,'meetup_id',m.id,'idempotent',true); end if;
   update public.exchange_meetups set proposed_by=me,venue_name=trim(p_venue_name),venue_area=nullif(trim(p_venue_area),''),meetup_at=p_meetup_at,status='scheduled',safety_ack_a=false,safety_ack_b=false,arrived_a=false,arrived_b=false,inspected_a=false,inspected_b=false,confirmed_a=false,confirmed_b=false,issue_a=null,issue_b=null,updated_at=now() where id=m.id returning * into m;
 else
   insert into public.exchange_meetups(exchange_id,proposed_by,venue_name,venue_area,meetup_at,status) values(e.id,me,trim(p_venue_name),nullif(trim(p_venue_area),''),p_meetup_at,'scheduled') returning * into m;
 end if;
 insert into public.notifications(user_id,kind,title,body,created_at) values(case when me=e.user_a then e.user_b else e.user_a end,'meetup_proposed','Meetup proposed','Your collector proposed a public meetup for this exchange.',now());
 return jsonb_build_object('ok',true,'meetup_id',m.id,'idempotent',false);
end $$;

create or replace function public.setup_return_meetup(p_exchange_id uuid,p_venue_name text,p_venue_area text,p_meetup_at timestamptz)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.exchanges%rowtype; me uuid:=auth.uid(); r public.exchange_returns%rowtype; same boolean:=false;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 if nullif(trim(p_venue_name),'') is null then raise exception 'Choose a public return venue'; end if;
 if p_meetup_at is null or p_meetup_at<=now() then raise exception 'Choose a future return meeting time'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found or me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 if e.state<>'swap_active' then raise exception 'Return scheduling is available only during an active temporary swap'; end if;
 select * into r from public.exchange_returns where exchange_id=e.id for update;
 if found then
   same := coalesce(trim(r.venue_name),'')=trim(p_venue_name) and coalesce(trim(r.venue_area),'')=coalesce(trim(p_venue_area),'') and r.meetup_at=p_meetup_at;
   if same then return jsonb_build_object('ok',true,'return_id',r.id,'idempotent',true); end if;
   update public.exchange_returns set proposed_by=me,venue_name=trim(p_venue_name),venue_area=nullif(trim(p_venue_area),''),meetup_at=p_meetup_at,status='scheduled',safety_ack_a=false,safety_ack_b=false,arrived_a=false,arrived_b=false,inspected_a=false,inspected_b=false,confirmed_a=false,confirmed_b=false,issue_a=null,issue_b=null,updated_at=now() where id=r.id returning * into r;
 else
   insert into public.exchange_returns(exchange_id,proposed_by,venue_name,venue_area,meetup_at,status) values(e.id,me,trim(p_venue_name),nullif(trim(p_venue_area),''),p_meetup_at,'scheduled') returning * into r;
 end if;
 insert into public.notifications(user_id,kind,title,body,created_at) values(case when me=e.user_a then e.user_b else e.user_a end,'return_meetup_proposed','Return meetup proposed','Your collector proposed a public meetup to return the temporarily swapped LEGO sets.',now());
 return jsonb_build_object('ok',true,'return_id',r.id,'idempotent',false);
end $$;

-- Terminal confirmation retries are explicitly idempotent. Intermediate actions remain safe to repeat.
create or replace function public.meetup_action(p_exchange_id uuid,p_action text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.exchanges%rowtype; m public.exchange_meetups%rowtype; me uuid:=auth.uid(); isa boolean; done boolean;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found or me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 select * into m from public.exchange_meetups where exchange_id=e.id for update;
 isa:=me=e.user_a;
 if e.state='swap_active' and p_action='confirm' and found and ((isa and m.confirmed_a) or (not isa and m.confirmed_b)) then return jsonb_build_object('ok',true,'handoff_completed',true,'status','swap_active','idempotent',true); end if;
 if e.state in('swap_active','completed','cancelled','disputed') then raise exception 'Initial handoff is already closed'; end if;
 if not found then raise exception 'Schedule a meetup first'; end if;
 if p_action='safety_ack' then if isa then update public.exchange_meetups set safety_ack_a=true,updated_at=now() where id=m.id; else update public.exchange_meetups set safety_ack_b=true,updated_at=now() where id=m.id; end if;
 elsif p_action='arrived' then if not (m.safety_ack_a and m.safety_ack_b) then raise exception 'Both collectors must accept the Safe Meetup rules before arrival can be confirmed'; end if; if isa then update public.exchange_meetups set arrived_a=true,status='meeting',updated_at=now() where id=m.id; else update public.exchange_meetups set arrived_b=true,status='meeting',updated_at=now() where id=m.id; end if;
 elsif p_action='inspected' then if not (m.arrived_a and m.arrived_b) then raise exception 'Both collectors must be present before either set can be inspected'; end if; if isa then update public.exchange_meetups set inspected_a=true,status='inspection',updated_at=now() where id=m.id; else update public.exchange_meetups set inspected_b=true,status='inspection',updated_at=now() where id=m.id; end if;
 elsif p_action='confirm' then if not (m.inspected_a and m.inspected_b) then raise exception 'Both collectors must inspect the other set before completing the handoff'; end if; if isa then update public.exchange_meetups set confirmed_a=true,updated_at=now() where id=m.id; else update public.exchange_meetups set confirmed_b=true,updated_at=now() where id=m.id; end if;
 elsif p_action='issue' then if nullif(trim(p_note),'') is null then raise exception 'Describe the issue before reporting it'; end if; if isa then update public.exchange_meetups set issue_a=trim(p_note),status='issue',updated_at=now() where id=m.id; else update public.exchange_meetups set issue_b=trim(p_note),status='issue',updated_at=now() where id=m.id; end if; update public.exchanges set state='disputed',updated_at=now() where id=e.id;
 else raise exception 'Invalid meetup action'; end if;
 select * into m from public.exchange_meetups where id=m.id;
 done:=m.confirmed_a and m.confirmed_b and m.inspected_a and m.inspected_b and m.arrived_a and m.arrived_b and m.safety_ack_a and m.safety_ack_b;
 if done then update public.exchange_meetups set status='completed',updated_at=now() where id=m.id; update public.exchanges set state='swap_active',outbound_completed_at=now(),return_due_at=now()+make_interval(days=>duration_days),updated_at=now() where id=e.id; insert into public.notifications(user_id,kind,title,body,created_at) values(e.user_a,'swap_started','Temporary swap started','The handoff is complete. Your LEGO set is due to be returned after the agreed swap period.',now()),(e.user_b,'swap_started','Temporary swap started','The handoff is complete. Your LEGO set is due to be returned after the agreed swap period.',now()); end if;
 return jsonb_build_object('ok',true,'handoff_completed',done,'status',case when done then 'swap_active' else m.status end,'idempotent',false);
end $$;

create or replace function public.return_action(p_exchange_id uuid,p_action text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.exchanges%rowtype; r public.exchange_returns%rowtype; me uuid:=auth.uid(); isa boolean; done boolean;
begin
 if me is null then raise exception 'Not authenticated'; end if;
 select * into e from public.exchanges where id=p_exchange_id for update;
 if not found or me not in(e.user_a,e.user_b) then raise exception 'Not an exchange participant'; end if;
 select * into r from public.exchange_returns where exchange_id=e.id for update;
 isa:=me=e.user_a;
 if e.state='completed' and p_action='confirm' and found and ((isa and r.confirmed_a) or (not isa and r.confirmed_b)) then return jsonb_build_object('ok',true,'completed',true,'status','completed','idempotent',true); end if;
 if e.state<>'swap_active' then raise exception 'Return workflow is not active'; end if;
 if not found then raise exception 'Schedule a return meetup first'; end if;
 if p_action='safety_ack' then if isa then update public.exchange_returns set safety_ack_a=true,updated_at=now() where id=r.id; else update public.exchange_returns set safety_ack_b=true,updated_at=now() where id=r.id; end if;
 elsif p_action='arrived' then if not (r.safety_ack_a and r.safety_ack_b) then raise exception 'Both collectors must accept the Safe Meetup rules before arrival can be confirmed'; end if; if isa then update public.exchange_returns set arrived_a=true,status='meeting',updated_at=now() where id=r.id; else update public.exchange_returns set arrived_b=true,status='meeting',updated_at=now() where id=r.id; end if;
 elsif p_action='inspected' then if not (r.arrived_a and r.arrived_b) then raise exception 'Both collectors must be present before returned sets can be inspected'; end if; if isa then update public.exchange_returns set inspected_a=true,status='inspection',updated_at=now() where id=r.id; else update public.exchange_returns set inspected_b=true,status='inspection',updated_at=now() where id=r.id; end if;
 elsif p_action='confirm' then if not (r.inspected_a and r.inspected_b) then raise exception 'Both collectors must inspect the returned sets before completing the return'; end if; if isa then update public.exchange_returns set confirmed_a=true,updated_at=now() where id=r.id; else update public.exchange_returns set confirmed_b=true,updated_at=now() where id=r.id; end if;
 elsif p_action='issue' then if nullif(trim(p_note),'') is null then raise exception 'Describe the return issue before reporting it'; end if; if isa then update public.exchange_returns set issue_a=trim(p_note),status='issue',updated_at=now() where id=r.id; else update public.exchange_returns set issue_b=trim(p_note),status='issue',updated_at=now() where id=r.id; end if; update public.exchanges set state='disputed',updated_at=now() where id=e.id;
 else raise exception 'Invalid return action'; end if;
 select * into r from public.exchange_returns where id=r.id;
 done:=r.confirmed_a and r.confirmed_b and r.inspected_a and r.inspected_b and r.arrived_a and r.arrived_b and r.safety_ack_a and r.safety_ack_b;
 if done then update public.exchange_returns set status='completed',updated_at=now() where id=r.id; update public.exchanges set state='completed',completed_at=now(),updated_at=now() where id=e.id; update public.collection_items set available_for_exchange=true where id in(e.item_a,e.item_b); insert into public.notifications(user_id,kind,title,body,created_at) values(e.user_a,'return_completed','Temporary swap completed','Both LEGO sets have been returned and confirmed. You can now review each other.',now()),(e.user_b,'return_completed','Temporary swap completed','Both LEGO sets have been returned and confirmed. You can now review each other.',now()); end if;
 return jsonb_build_object('ok',true,'completed',done,'status',case when done then 'completed' else r.status end,'idempotent',false);
end $$;
