import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js"
import { supabase } from "./supabase"

type FunctionResult<T> = { data: T | null; error: string | null }

// Calls a Supabase Edge Function with the signed-in user's session (anon key + user JWT).
// Turns every failure into a readable message instead of a generic "non-2xx" error.
export async function invokeFunction<T = Record<string, unknown>>(
  name: "admin-users" | "impersonate" | "oauth-gate",
  body: Record<string, unknown>,
): Promise<FunctionResult<T>> {
  const { data: current } = await supabase.auth.getSession()
  if (!current.session) return { data: null, error: "Your session expired. Please sign in again." }

  const { data, error } = await supabase.functions.invoke(name, { body })
  if (!error) return { data: data as T, error: null }

  if (error instanceof FunctionsHttpError) {
    const detail = await error.context.json().catch(() => null)
    return { data: null, error: detail?.error ?? `The server rejected the request (${error.context.status}).` }
  }
  if (error instanceof FunctionsFetchError) {
    return {
      data: null,
      error: `Cannot reach the "${name}" function. It may not be deployed yet, or you are offline.`,
    }
  }
  if (error instanceof FunctionsRelayError) {
    return { data: null, error: "Supabase could not run the function. Try again in a moment." }
  }
  return { data: null, error: error.message }
}
