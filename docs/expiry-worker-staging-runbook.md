# Staging expiry-worker approval runbook

**Prepared instructions only. No cron job is scheduled and no migration is
applied by this change.** This runbook is for a separately reviewed, staging-only
approval after the matching exchange schema is already present. Scheduling
approval is pending; this runbook does not grant it.

## Target and worker behavior

Use only the explicitly verified staging Supabase project; compare its project
ref with the protected `BC_STAGING_SUPABASE_PROJECT_REF` and verify it is not
`BC_PRODUCTION_SUPABASE_PROJECT_REF` before opening the SQL editor. Never use a
production connection or production credential for this procedure.

The existing `public.expire_exchange_cases(integer)` function is defined by
`supabase/migrations/20260916052934_canonical_exchange_state_machine.sql`.
It expires due `PROPOSED` cases in response-deadline order, uses
`FOR UPDATE SKIP LOCKED`, clamps its batch size to 1–1000, increments case
state/version, restores exchange preferences, appends an `expire` case event,
and records notifications through the existing case-notification helper. The
function is revoked from `public`, `anon`, and `authenticated`; its migration
grants execution to `service_role`. Confirm the actual scheduling role can
execute it before scheduling. A cron job's database role must not be assumed to
inherit service-role access.

The proposed cadence for review is every five minutes with a fixed call limit
of 100:

```sql
select cron.schedule(
  'brickcircle-expire-exchange-cases-staging',
  '*/5 * * * *',
  $$select public.expire_exchange_cases(100);$$
);
```

Any different cadence or batch size requires separate review. Do not install an
extension, alter grants, create a wrapper, apply SQL migrations, or add a
production schedule as part of this procedure.

## Required preflight and conflict checks

1. Obtain the separate change approval and confirm the target in the Supabase
   dashboard is the staging project. Confirm PR176's required schema change was
   already applied through its separately approved process; this runbook does
   not apply or verify a hosted migration on the operator's behalf.
2. In that staging database, use read-only checks to confirm
   `to_regprocedure('public.expire_exchange_cases(integer)')` exists, inspect
   its definition and grants, and confirm the intended cron execution role has
   `EXECUTE`. Run the privilege check as the exact database role that will
   schedule the job; `cron.schedule` runs jobs with the permissions of its
   caller. If any check fails or differs from the source, stop.
   Example read-only checks:

   ```sql
   select to_regprocedure('public.expire_exchange_cases(integer)') as worker;
   select has_function_privilege(
     current_user, 'public.expire_exchange_cases(integer)', 'EXECUTE'
   ) as scheduler_can_execute;
   select exists(select 1 from pg_extension where extname='pg_cron') as cron_installed;
   ```

3. Confirm `pg_cron` and its `cron.job` / `cron.job_run_details` objects are
   available. Do not install or upgrade the extension as part of this change.
4. Review existing `cron.job` entries for the proposed job name, any command
   calling `public.expire_exchange_cases`, and any other expiry worker. Resolve
   duplicates or competing schedulers before creating anything. If the
   installed Cron version does not expose the name/fields required to make this
   check unambiguous, stop and obtain a version-specific reviewed procedure;
   do not guess or create a second job. For common `pg_cron` versions, the
   following read-only query checks both the candidate name (when exposed) and
   any job command containing `expire`:

   ```sql
   select j.jobid, j.schedule, j.command, j.active, j.database, j.username,
          to_jsonb(j)->>'jobname' as jobname
   from cron.job as j
   where coalesce(to_jsonb(j)->>'jobname','') =
           'brickcircle-expire-exchange-cases-staging'
      or j.command ilike '%expire%'
   order by j.jobid;
   ```

   Review every returned row and other configured schedulers manually; the
   query is a conflict screen, not proof that no external worker exists.
5. Verify staging notification dispatchers/provider integrations remain
   disabled or explicitly outbox-only, inspect the intended notification
   queues, and confirm test/real provider delivery will not occur. This
   function can create notification records; a scheduler is not itself a
   delivery-safety control.
6. Record the pre-run count and age of due proposals and the latest
   `expire`-event timestamp. Confirm an owner is available to monitor Cron runs,
   application state, and notification queues for the initial observation
   window.

Only after these checks pass and separate scheduling approval is explicitly
granted, run the schedule statement once in the verified staging SQL editor.
Record the returned job ID, exact project ref, approver, operator, timestamp,
and schedule in the change record. Do not re-run the statement merely because
the client response is unclear; first inspect `cron.job` for the resulting
entry.

## Monitoring and stop conditions

For the initial run, monitor `cron.job_run_details` for the recorded job ID:
successful status, start/end times, duration, and error/return details. Inspect
the due-proposal backlog and recent `expire` events in `exchange_cases` and
`exchange_case_events`, then verify notification records remain in the intended
staging-only path. Compare each run's work to the bounded maximum of 100; a
successful zero count is normal when no due proposals exist. Supabase recommends
no more than eight concurrently running Cron jobs and jobs shorter than ten
minutes; this job should ordinarily finish well within its five-minute cadence.

Example read-only monitoring queries (replace `12345` with the recorded
integer job ID before running):

```sql
select jobid, status, start_time, end_time, return_message
from cron.job_run_details
where jobid = 12345
order by start_time desc
limit 20;

select count(*) as due_proposals, min(response_deadline) as oldest_deadline
from public.exchange_cases
where state='PROPOSED' and response_deadline <= now();

select count(*) as expires_last_hour, max(created_at) as latest_expire
from public.exchange_case_events
where event_type='expire' and created_at >= now() - interval '1 hour';
```

Stop and unschedule the job if it errors repeatedly, overlaps its cadence,
exceeds the expected bounded work, changes non-staging records, or causes
unexpected provider delivery or notification growth. Investigate an increasing
due backlog, missing run records, or notifications not draining under the
intended staging policy; do not increase limits to mask a problem.

## Rollback

Use the recorded job ID to remove only this exact job, then verify it is absent
or inactive in `cron.job` and confirm no subsequent run starts. Replace `12345`
with the recorded integer job ID before running:

```sql
select cron.unschedule(12345);
```

Unscheduling prevents future invocations; it does not undo already expired
cases, their append-only events, restored preferences, or notifications. Do not
reopen cases, delete events, or replay/repair notification records as rollback.
Any data repair is a separately scoped and approved operation.

## Production is a separate approval

Nothing here approves production use. A production rollout requires a new
change review for the exact production project, migration/schema state, role
grants, notification/provider behavior, schedule ownership, monitoring, and
rollback plan. Do not copy the staging job or credentials to production.

## Documentation sources

- Supabase Cron guide: <https://supabase.com/docs/guides/cron> (accessed
  2026-10-19). It documents SQL/dashboard scheduling, job run history, and
  recommends no more than eight concurrent jobs and less than ten minutes per
  job.
- pg_cron documentation: <https://github.com/citusdata/pg_cron> (accessed
  2026-10-19). It documents the `cron.job` and `cron.job_run_details` fields,
  caller-role execution, scheduling, and unscheduling APIs.
