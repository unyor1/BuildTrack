import { createClient } from "npm:@supabase/supabase-js@2.117.3"
import { receiveEnrollment } from "./handler.ts"

// Device token authentication is enforced by the handler + database; website JWTs cannot complete enrollment.
const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } })
Deno.serve(req => receiveEnrollment(req, args => client.rpc("process_worker_enrollment", args)))
