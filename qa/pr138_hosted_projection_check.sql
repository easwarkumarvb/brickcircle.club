-- ROOT EXECUTION ONLY. Before running, independently verify the Supabase endpoint
-- is dedicated hosted staging project tteyypklldgwwicrgjzt. Never run in production.
-- Everything below is transaction-local, including fixtures, profile metadata,
-- canonical notifications/outbox, read cursors, temp tables and derived rows.
-- No SQL results contain user IDs, emails, messages, photos or existing records.
BEGIN;
SET LOCAL statement_timeout = '90s';
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE qa_actors(label text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE qa_items(n integer PRIMARY KEY,id uuid NOT NULL,owner_id uuid NOT NULL,set_number text NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE qa_messages(n integer PRIMARY KEY,id uuid NOT NULL,created_at timestamptz) ON COMMIT DROP;
CREATE TEMP TABLE qa_proof(check_name text PRIMARY KEY,passed boolean NOT NULL CHECK(passed)) ON COMMIT DROP;
GRANT SELECT,INSERT,UPDATE ON qa_actors,qa_items,qa_messages,qa_proof TO authenticated;

DO $qa$
DECLARE
 a uuid; b uuid; outsider uuid; run_key text:='pr138-rollback-'||gen_random_uuid()::text;
 offered uuid; requested uuid; case_one uuid; case_two uuid; case_message uuid; own_outsider_message uuid;
 result jsonb; retried jsonb; row_record record; step jsonb; steps jsonb;
 version bigint; baseline_active bigint; actual bigint; first_count bigint; second_count bigint;
 cursor_at timestamptz; cursor_type text; cursor_id uuid; oldest_at timestamptz; oldest_type text; oldest_id uuid;
 denied boolean; i integer; actor uuid; body_text text; cursor_before jsonb; cursor_after jsonb;
BEGIN
 -- Only pre-existing disposable actors with already confirmed adult profiles.
 INSERT INTO qa_actors(label,id)
 SELECT CASE row_number() OVER(ORDER BY u.id) WHEN 1 THEN 'a' WHEN 2 THEN 'b' ELSE 'outsider' END,u.id
 FROM auth.users u JOIN public.profiles p ON p.id=u.id
 WHERE lower(split_part(coalesce(u.email,''),'@',2))='example.test'
   AND p.adult_confirmed_at IS NOT NULL
 ORDER BY u.id LIMIT 3;
 IF (SELECT count(*) FROM qa_actors) IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'QA requires three existing confirmed disposable actors'; END IF;
 SELECT id INTO a FROM qa_actors WHERE label='a';
 SELECT id INTO b FROM qa_actors WHERE label='b';
 SELECT id INTO outsider FROM qa_actors WHERE label='outsider';
 IF EXISTS(SELECT 1 FROM qa_actors q JOIN auth.users u ON u.id=q.id
     WHERE lower(split_part(coalesce(u.email,''),'@',2)) IS DISTINCT FROM 'example.test') THEN
   RAISE EXCEPTION 'Disposable actor guard failed';
 END IF;
 -- Eligibility metadata is fixture seed as postgres, only these disposable actors.
 UPDATE public.profiles SET country='India',city='Bangalore' WHERE id IN(a,b);
 SELECT count(*) INTO baseline_active FROM public.exchange_cases c
 WHERE ((c.user_a=a AND c.user_b=b) OR(c.user_a=b AND c.user_b=a))
   AND c.state NOT IN('DECLINED','WITHDRAWN','EXPIRED','CANCELLED','COMPLETED');
 INSERT INTO qa_items(n,id,owner_id,set_number)
 SELECT row_number() OVER(ORDER BY s.set_number)::integer,gen_random_uuid(),
   CASE WHEN row_number() OVER(ORDER BY s.set_number)%2=1 THEN a ELSE b END,s.set_number
 FROM public.lego_sets s
 WHERE NOT EXISTS(SELECT 1 FROM public.collection_items ci WHERE ci.user_id IN(a,b) AND ci.set_number=s.set_number)
 ORDER BY s.set_number LIMIT 4;
 IF (SELECT count(*) FROM qa_items) IS DISTINCT FROM 4 THEN RAISE EXCEPTION 'QA requires four unused existing catalogue sets'; END IF;
 INSERT INTO public.collection_items(id,user_id,set_number,condition,completeness,original_box,available_for_exchange,owner_photo_path,notes)
 SELECT id,owner_id,set_number,'Excellent',100,false,true,
   'hosted-smoke/'||run_key||'/fixture-'||n::text||'.jpg','Rollback-only disposable hosted projection fixture'
 FROM qa_items;
 INSERT INTO public.wishlists(user_id,set_number,priority)
 SELECT CASE WHEN owner_id=a THEN b ELSE a END,set_number,3 FROM qa_items
 ON CONFLICT(user_id,set_number) DO NOTHING;

 -- Canonical proposal and retry from independently authenticated actor A.
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',a::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 SELECT id INTO offered FROM qa_items WHERE n=1;SELECT id INTO requested FROM qa_items WHERE n=2;
 result:=public.create_exchange_case(offered,requested,30,'Rollback fixture proposal',run_key||':proposal-one');
 case_one:=(result->'case'->>'id')::uuid;version:=(result->'case'->>'state_version')::bigint;
 IF result->'case'->>'state' IS DISTINCT FROM 'PROPOSED' OR case_one IS NULL THEN RAISE EXCEPTION 'Canonical proposal failed'; END IF;
 retried:=public.create_exchange_case(offered,requested,30,'Rollback fixture proposal',run_key||':proposal-one');
 IF retried->'case'->>'id' IS DISTINCT FROM case_one::text OR retried->>'idempotent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Proposal retry duplicated source'; END IF;
 SELECT id INTO offered FROM qa_items WHERE n=3;SELECT id INTO requested FROM qa_items WHERE n=4;
 result:=public.create_exchange_case(offered,requested,30,'Second rollback fixture proposal',run_key||':proposal-two');
 case_two:=(result->'case'->>'id')::uuid;
 result:=public.send_exchange_case_message(case_one,'Rollback fixture case message',run_key||':case-message');
 case_message:=(result->'message'->>'id')::uuid;
 retried:=public.send_exchange_case_message(case_one,'Rollback fixture case message',run_key||':case-message');
 IF retried->'message'->>'id' IS DISTINCT FROM case_message::text OR retried->>'idempotent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Case message retry duplicated source'; END IF;
 INSERT INTO qa_proof VALUES('canonical proposals and message retry are idempotent',true);

 -- Six canonical direct messages prove bounded feed paging without fake rows.
 FOR i IN 1..6 LOOP
   body_text:='Rollback fixture direct message '||i::text;
   result:=public.send_collector_message(b,body_text,run_key||':direct:'||i::text);
   INSERT INTO qa_messages(n,id) VALUES(i,(result->'message'->>'id')::uuid);
   IF i=1 THEN
     retried:=public.send_collector_message(b,body_text,run_key||':direct:'||i::text);
     IF retried->'message'->>'id' IS DISTINCT FROM result->'message'->>'id' OR retried->>'idempotent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Direct message retry duplicated source'; END IF;
   END IF;
 END LOOP;
 -- Stable synthetic fixture times independent of pre-existing disposable history.
 EXECUTE 'RESET ROLE';
 UPDATE public.messages m SET created_at=timestamptz '2099-01-01 00:00:00+00'+q.n*interval '1 second'
 FROM qa_messages q WHERE m.id=q.id;
 UPDATE qa_messages q SET created_at=m.created_at FROM public.messages m WHERE m.id=q.id;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
 SELECT count(*) INTO actual FROM public.list_collector_conversations(NULL,NULL,30) s WHERE s.peer_id=a;
 IF actual IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Person-first inbox is not one row per peer'; END IF;
 SELECT active_case_count INTO actual FROM public.list_collector_conversations(NULL,NULL,30) s WHERE s.peer_id=a;
 IF actual IS DISTINCT FROM baseline_active+2 THEN RAISE EXCEPTION 'Person-first active case summary is inaccurate'; END IF;
 SELECT count(*) INTO first_count FROM public.collector_conversation_feed(a,NULL,NULL,NULL,5);
 IF first_count IS DISTINCT FROM 5 THEN RAISE EXCEPTION 'Feed first page is not bounded at five'; END IF;
 SELECT occurred_at,source_type,source_id INTO oldest_at,oldest_type,oldest_id
 FROM public.collector_conversation_feed(a,NULL,NULL,NULL,5)
 ORDER BY occurred_at,source_type COLLATE "C",source_id LIMIT 1;
 SELECT count(*) INTO second_count FROM public.collector_conversation_feed(a,oldest_at,oldest_type,oldest_id,5) f
 JOIN qa_messages q ON q.id=f.source_id WHERE f.source_type='direct_message';
 IF second_count IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Feed cursor skipped or duplicated fixture messages'; END IF;
 IF EXISTS(SELECT 1 FROM public.collector_conversation_feed(a,NULL,NULL,NULL,5) f
 JOIN public.collector_conversation_feed(a,oldest_at,oldest_type,oldest_id,5) g
 ON(g.source_type,g.source_id)=(f.source_type,f.source_id)) THEN RAISE EXCEPTION 'Feed pages overlap'; END IF;
 INSERT INTO qa_proof VALUES('one collector row, two cases and bounded gap-free feed pagination',true);

 -- Durable own cursor, server unread and stale cursor monotonicity.
 SELECT occurred_at,source_type,source_id INTO cursor_at,cursor_type,cursor_id
 FROM public.collector_conversation_feed(a,NULL,NULL,NULL,5)
 ORDER BY occurred_at DESC,source_type COLLATE "C" DESC,source_id DESC LIMIT 1;
 result:=public.mark_collector_conversation_read(a,cursor_at,cursor_type,cursor_id);
 SELECT unread_count INTO actual FROM public.list_collector_conversations(NULL,NULL,30) s WHERE s.peer_id=a;
 IF actual IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Displayed newest tuple did not clear own unread'; END IF;
 cursor_before:=result;
 SELECT created_at,id INTO oldest_at,oldest_id FROM qa_messages WHERE n=1;
 result:=public.mark_collector_conversation_read(a,oldest_at,'direct_message',oldest_id);
 IF (result->>'through_at',result->>'through_type',result->>'through_id') IS DISTINCT FROM
    (cursor_before->>'through_at',cursor_before->>'through_type',cursor_before->>'through_id') THEN
   RAISE EXCEPTION 'Older cursor regressed own read state';
 END IF;
 INSERT INTO qa_proof VALUES('server unread and own read cursor are monotonic',true);

 -- Deliberately corrupt ONLY rollback fixture-derived pointers as postgres.
 -- Source RLS must still win, including filtering before LIMIT: five newer
 -- unauthorized pointers cannot hide the outsider's older authorized own row.
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 result:=public.send_collector_message(a,'Rollback fixture outsider own message',run_key||':outsider-own');
 own_outsider_message:=(result->'message'->>'id')::uuid;
 EXECUTE 'RESET ROLE';
 UPDATE public.messages SET created_at=timestamptz '2098-01-01 00:00:00+00' WHERE id=own_outsider_message;
 FOR row_record IN SELECT id,created_at FROM qa_messages WHERE n<=5 LOOP
   PERFORM private.bc_project_conversation(outsider,a,row_record.created_at,'direct_message',row_record.id,NULL,true,false);
 END LOOP;
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 SELECT count(*) INTO actual FROM public.collector_conversation_feed(a,NULL,NULL,NULL,1) f
 WHERE f.source_id=own_outsider_message AND f.source_type='direct_message';
 IF actual IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Unauthorized projected pointers consumed feed limit'; END IF;
 SELECT count(*) INTO actual FROM public.list_collector_conversations(NULL,NULL,30) s
 WHERE s.peer_id=a AND s.last_id=own_outsider_message;
 IF actual IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Inbox selected unauthorized projected latest source'; END IF;
 INSERT INTO qa_proof VALUES('source RLS beats five forged rollback-only cache pointers before feed limit',true);

 -- Independent third actor sees no fixture sources or source bodies and cannot
 -- forge another collector's visible tuple, read cursor or derived projection.
 PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
 IF EXISTS(SELECT 1 FROM public.collector_conversation_feed(a,NULL,NULL,NULL,100) f
 WHERE f.source_id IN(SELECT id FROM qa_messages) OR f.case_id IN(case_one,case_two)) THEN RAISE EXCEPTION 'Outsider saw fixture feed sources'; END IF;
 IF EXISTS(SELECT 1 FROM public.exchange_cases WHERE id IN(case_one,case_two))
 OR EXISTS(SELECT 1 FROM public.exchange_case_messages WHERE id=case_message)
 OR EXISTS(SELECT 1 FROM public.messages WHERE id IN(SELECT id FROM qa_messages)) THEN RAISE EXCEPTION 'Outsider source RLS failed'; END IF;
 denied:=false;
 BEGIN PERFORM public.mark_collector_conversation_read(a,cursor_at,cursor_type,cursor_id);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Outsider forged visible cursor'; END IF;
 denied:=false;
 BEGIN INSERT INTO public.collector_conversation_read_cursors(user_id,peer_id,through_at,through_type,through_id)
 VALUES(a,b,cursor_at,cursor_type,cursor_id);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Outsider wrote foreign read state'; END IF;
 denied:=false;
 BEGIN DELETE FROM public.collector_conversation_entries WHERE source_id=cursor_id;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Browser role can alter derived sources'; END IF;
 INSERT INTO qa_proof VALUES('third actor source isolation and projection/read authorization',true);

 -- Full physical lifecycle uses only existing canonical transitions, as two
 -- independent authenticated actors; projection cannot bypass arrival/handoff.
 steps:=jsonb_build_array(
   jsonb_build_object('actor',b,'action','accept'),
   jsonb_build_object('actor',a,'action','propose_meetup','payload',jsonb_build_object('venue_name','Staging public library','venue_area','QA','meetup_at',now()+interval '1 day')),
   jsonb_build_object('actor',b,'action','accept_meetup'),
   jsonb_build_object('actor',a,'action','safety_ack'),jsonb_build_object('actor',b,'action','safety_ack'),
   jsonb_build_object('actor',a,'action','arrive'),jsonb_build_object('actor',b,'action','arrive'),
   jsonb_build_object('actor',a,'action','inspect'),jsonb_build_object('actor',b,'action','inspect'),
   jsonb_build_object('actor',a,'action','handoff'),jsonb_build_object('actor',b,'action','handoff'),
   jsonb_build_object('actor',a,'action','propose_return','payload',jsonb_build_object('venue_name','Staging public library','venue_area','QA','meetup_at',now()+interval '2 days')),
   jsonb_build_object('actor',b,'action','accept_return'),
   jsonb_build_object('actor',a,'action','return_arrive'),jsonb_build_object('actor',b,'action','return_arrive'),
   jsonb_build_object('actor',a,'action','return_inspect'),jsonb_build_object('actor',b,'action','return_inspect'),
   jsonb_build_object('actor',a,'action','return_confirm'),jsonb_build_object('actor',b,'action','return_confirm'));
 i:=0;
 FOR step IN SELECT value FROM jsonb_array_elements(steps) LOOP
   i:=i+1;actor:=(step->>'actor')::uuid;
   PERFORM set_config('request.jwt.claim.sub',actor::text,true);
   PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
   result:=public.exchange_case_transition(case_one,version,step->>'action',run_key||':transition:'||i::text,coalesce(step->'payload','{}'::jsonb));
   version:=(result->'case'->>'state_version')::bigint;
   IF i=6 THEN
     denied:=false;
     BEGIN PERFORM public.exchange_case_transition(case_one,version,'inspect',run_key||':early-inspection','{}'::jsonb);
     EXCEPTION WHEN OTHERS THEN denied:=true; END;
     IF NOT denied THEN RAISE EXCEPTION 'Inspection bypassed mutual arrival gate'; END IF;
   END IF;
   IF i=10 AND result->'case'->>'state' IS DISTINCT FROM 'HANDOFF_PENDING' THEN RAISE EXCEPTION 'Single handoff bypassed mutual handoff gate'; END IF;
   IF i=11 AND result->'case'->>'state' IS DISTINCT FROM 'ACTIVE' THEN RAISE EXCEPTION 'Mutual handoff did not activate'; END IF;
 END LOOP;
 IF result->'case'->>'state' IS DISTINCT FROM 'COMPLETED' THEN RAISE EXCEPTION 'Canonical return journey did not complete'; END IF;
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
 SELECT active_case_count INTO actual FROM public.list_collector_conversations(NULL,NULL,30) s WHERE s.peer_id=a;
 IF actual IS DISTINCT FROM baseline_active+1 THEN RAISE EXCEPTION 'Completion did not update active case summary'; END IF;
 SELECT count(*) INTO actual FROM public.collector_conversation_feed(a,oldest_at,'direct_message',oldest_id,100) f
 WHERE f.case_id=case_one AND f.source_type='case_event';
 IF actual<19 THEN RAISE EXCEPTION 'Canonical journey event history missing from feed'; END IF;
 INSERT INTO qa_proof VALUES('canonical meetup, mutual handoff, return and completion stay server-owned',true);

 -- Rollback-only source deletion: projector must remove fixture body references.
 EXECUTE 'RESET ROLE';
 DELETE FROM public.messages WHERE id=(SELECT id FROM qa_messages WHERE n=6);
 EXECUTE 'SET LOCAL ROLE authenticated';
 PERFORM set_config('request.jwt.claim.sub',b::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
 IF EXISTS(SELECT 1 FROM public.collector_conversation_feed(a,NULL,NULL,NULL,100) f
 WHERE f.source_id=(SELECT id FROM qa_messages WHERE n=6)) THEN RAISE EXCEPTION 'Deleted fixture source remains visible'; END IF;
 INSERT INTO qa_proof VALUES('source deletion removes projected feed body',true);
 EXECUTE 'RESET ROLE';
END;
$qa$;
SELECT 'dedicated hosted staging, rollback-only' AS target,check_name,passed FROM qa_proof ORDER BY check_name;
ROLLBACK;
SELECT true AS rollback_completed, true AS hosted_projection_and_canonical_assertions_passed;
