/* BrickCircle Supabase API-key compatibility shim.
   Supabase currently exposes both legacy anon and publishable keys. Some browser/auth
   paths can reject the publishable key with "Invalid API key"; use the active legacy
   anon key for browser clients while RLS continues to protect all data.
*/
(()=>{
  const ACTIVE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zeHRyb21qZHBkc2NrbmFkeGV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMDM2NDAsImV4cCI6MjEwMjY3OTY0MH0.3kAE4hyn43qlMvinjVU5M06Rx-sZVYMI09IkuY6ELco';
  const original=window.supabase?.createClient;
  if(!original)return;
  window.supabase.createClient=(url,key,...rest)=>original(url,ACTIVE_ANON_KEY,...rest);
})();
