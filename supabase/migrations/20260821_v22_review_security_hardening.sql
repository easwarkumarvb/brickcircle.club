-- BrickCircle V2.2 review security hardening
-- Reviews can only be created through submit_exchange_review after completion.
drop policy if exists "participants create reviews" on public.reviews;
drop policy if exists "participants read reviews" on public.reviews;
drop policy if exists "users update notifications" on public.notifications;
drop policy if exists "users update own notifications" on public.notifications;
create policy "authenticated read reviews" on public.reviews for select to authenticated using(true);
create policy "users update own notifications" on public.notifications for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
revoke insert on public.reviews from authenticated;
revoke update,delete on public.reviews from authenticated;
