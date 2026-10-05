import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { createHandler } from './handler.mjs';

// Every request validates the Auth user and trusted DB allowlist. Database RPCs
// also validate the live session; no service-role client or elevated key is used.
Deno.serve(createHandler(createClient, (name: string) => Deno.env.get(name)));
