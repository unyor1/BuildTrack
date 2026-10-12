import { useCallback, useEffect, useState } from "react"
import { EmptyState, buttonSecondary, inputClass } from "../../components/ui/PageParts"
import { SkeletonRows } from "../../components/ui/Skeleton"
import { activityLabel, formatDate, formatTime } from "../../lib/admin"
import { downloadCsv, toCsv } from "../../lib/progress"
import { supabase } from "../../lib/supabase"
import { useToast } from "../../lib/toast"
import { PageIntro, Panel } from "./AdminShell"
import type { AdminPageProps } from "./types"

type Row = { id: number; created_at: string; actor_name: string; actor_email: string | null; action: string; target_name: string | null; summary: string | null }

const PAGE = 100
const knownActions = ["profile.status_changed", "profile.role_changed", "oauth.enroll", "oauth.blocked", "registration.submitted", "whitelist.apply", "whitelist.add", "whitelist.remove", "access.approve", "access.reject", "user.reopen", "user.create", "user.update", "user.approve", "user.reject", "user.enable", "user.disable", "user.impersonate", "user.set_permissions", "settings.update", "project.export", "invite.create", "invite.disable", "invite.enable", "invite.redeem", "projects.insert", "projects.update", "projects.delete", "project_members.insert", "project_members.update", "project_members.delete"]

// "{"role":"foreman","max_uses":1}" -> "role: foreman, max uses: 1" (the database stores details as JSON text)
const readable = (summary: string | null) => {
  if (!summary) return ""
  try {
    const value = JSON.parse(summary) as Record<string, unknown>
    return Object.entries(value).map(([key, item]) => `${key.replace(/_/g, " ")}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}`).join(", ")
  } catch {
    return summary
  }
}

// Who did what and when. Needs the "View users" permission (checked again by the database).
export default function AuditLog(_: AdminPageProps) {
  const toast = useToast()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [action, setAction] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const load = useCallback(
    async (offset: number) => {
      setLoading(true)
      const { data, error: rpcError } = await supabase.rpc("get_audit_log", {
        p_search: search.trim() || null,
        p_action: action || null,
        p_from: from ? new Date(`${from}T00:00:00+08:00`).toISOString() : null,
        p_to: to ? new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86_400_000).toISOString() : null,
        p_limit: PAGE,
        p_offset: offset,
      })
      setLoading(false)
      if (rpcError) return setError(/permission/i.test(rpcError.message) ? "You need the View users permission to read the audit log." : "Could not load the audit log. Check your connection and try again.")
      setError("")
      const list = (data as Row[] | null) ?? []
      setRows((current) => (offset === 0 ? list : [...current, ...list]))
      setMore(list.length === PAGE)
    },
    [search, action, from, to],
  )

  // Reload when a filter changes (search waits for typing to pause).
  useEffect(() => {
    const timer = window.setTimeout(() => void load(0), 300)
    return () => window.clearTimeout(timer)
  }, [load])

  const exportCsv = () => {
    downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(["When (UTC)", "Who", "Email", "Action", "About", "Details"], rows.map((row) => [row.created_at, row.actor_name, row.actor_email ?? "", activityLabel(row.action), row.target_name ?? "", readable(row.summary)])))
    toast.success("Exported", `${rows.length} rows`)
  }

  return (
    <div className="admin-page">
      <PageIntro eyebrow="Security" title="Audit log" description="Every sensitive change: approvals, role changes, permissions, impersonation, invitation codes and project edits. Entries cannot be edited." action={<button type="button" className={buttonSecondary} onClick={exportCsv} disabled={!rows.length}>Export CSV</button>} />
      <Panel>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-xs font-bold uppercase tracking-wider text-fg-muted">Search
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email or detail" className={`${inputClass} mt-1 !w-56 normal-case`} />
          </label>
          <label className="text-xs font-bold uppercase tracking-wider text-fg-muted">Action
            <select value={action} onChange={(event) => setAction(event.target.value)} className={`${inputClass} mt-1 !w-52 normal-case`}>
              <option value="">All actions</option>
              {knownActions.map((key) => <option key={key} value={key}>{activityLabel(key)}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold uppercase tracking-wider text-fg-muted">From
            <input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} className={`${inputClass} mt-1 !w-40`} />
          </label>
          <label className="text-xs font-bold uppercase tracking-wider text-fg-muted">To
            <input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} className={`${inputClass} mt-1 !w-40`} />
          </label>
          {search || action || from || to ? <button type="button" className="pb-2 text-sm font-bold text-brand-text underline" onClick={() => { setSearch(""); setAction(""); setFrom(""); setTo("") }}>Clear filters</button> : null}
        </div>
        {error ? <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{error}</p> : null}
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Date</th><th>Time (PHT)</th><th>Who</th><th>Action</th><th>About</th><th>Details</th></tr></thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <SkeletonRows rows={8} cols={6} />
              ) : rows.length === 0 && !error ? (
                <tr><td colSpan={6}><EmptyState title="No entries match">Try other words or a wider date range.</EmptyState></td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td className="is-muted">{formatDate(row.created_at)}</td>
                    <td className="is-muted">{formatTime(row.created_at)}</td>
                    <td className="is-strong" title={row.actor_email ?? undefined}>{row.actor_name}</td>
                    <td>{activityLabel(row.action)}</td>
                    <td>{row.target_name ?? "—"}</td>
                    <td className="is-muted max-w-xs break-words text-xs">{readable(row.summary)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {more ? (
          <div className="mt-4 text-center">
            <button type="button" className={buttonSecondary} disabled={loading} onClick={() => void load(rows.length)}>{loading ? "Loading..." : "Load older entries"}</button>
          </div>
        ) : null}
      </Panel>
    </div>
  )
}
