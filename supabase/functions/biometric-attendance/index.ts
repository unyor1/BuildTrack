import { createClient } from "npm:@supabase/supabase-js@2.117.3"
import { receiveAttendance } from "./handler.ts"

// verify_jwt=false is required for device tokens (not website user sessions).
// The handler and database RPC authenticate every event against a project-scoped, revocable token.
const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } })
Deno.serve(req => receiveAttendance(req, args => client.rpc("ingest_biometric_device_event", args)))
