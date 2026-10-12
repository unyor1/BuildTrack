import { useCallback, useEffect, useState } from "react"
import { parseSettings, settingsError, type SettingRow } from "./settingsModel.ts"
import { supabase } from "./supabase"

export * from "./settingsModel.ts"

// Everyone active can read the settings; the database refuses writes from anyone but a Super Admin.
export function useSettings() {
  const [rows, setRows] = useState<SettingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const reload = useCallback(async () => {
    const { data, error: loadError } = await supabase.from("system_settings").select("key,value,updated_at,updated_by")
    setError(loadError ? "Could not load the settings. Check your connection and try again." : "")
    setRows((data as SettingRow[] | null) ?? [])
    setLoading(false)
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  const save = useCallback(
    async (key: string, value: unknown): Promise<string | null> => {
      const { error: rpcError } = await supabase.rpc("set_setting", { p_key: key, p_value: value })
      if (rpcError) return settingsError(rpcError)
      await reload()
      return null
    },
    [reload],
  )
  return { settings: parseSettings(rows), rows, loading, error, reload, save }
}
