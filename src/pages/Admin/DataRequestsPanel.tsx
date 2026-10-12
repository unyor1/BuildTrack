import { useCallback, useEffect, useState } from "react"
import Modal from "../../components/Modal"
import { formatDate } from "../../lib/admin"
import type { Profile } from "../../lib/auth"
import { useConfirm } from "../../lib/confirm"
import { declineErasure, type DataRequest } from "../../lib/dataRequests"
import { invokeFunction } from "../../lib/functions"
import { supabase } from "../../lib/supabase"
import { errorText, useToast } from "../../lib/toast"

const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-semibold text-fg shadow-sm hover:border-brand/50 hover:text-brand-text disabled:opacity-60"
const danger = "rounded-lg bg-[#d93a3a] px-4 py-2 text-sm font-bold text-white hover:bg-[#b82f2f] disabled:opacity-60"

// People who asked for their data to be deleted (RA 10173). Erasing clears their personal data and closes the account; declining needs a reason.
export default function DataRequestsPanel({ users, onChanged }: { users: Profile[]; onChanged: () => Promise<void> | void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [rows, setRows] = useState<DataRequest[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [declining, setDeclining] = useState<DataRequest | null>(null)
  const [note, setNote] = useState("")

  const load = useCallback(async () => {
    const { data } = await supabase.from("data_requests").select("*").eq("status", "open").order("created_at")
    setRows((data as DataRequest[] | null) ?? [])
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const who = (id: string) => users.find((user) => user.id === id)

  const erase = async (row: DataRequest) => {
    const person = who(row.user_id)
    if (!(await confirm({ title: `Erase the data of ${person?.full_name ?? "this person"}?`, message: "Their details, ID photos and sign-in email are deleted and the account is closed for good. Site records stay as \"Deleted account\". This cannot be undone.", confirmLabel: "Erase data", tone: "danger" }))) return
    setBusy(row.id)
    const { data, error } = await invokeFunction<{ files_removed: number }>("admin-users", { action: "erase_user", request_id: row.id })
    setBusy(null)
    if (error) return toast.error("Not erased", error)
    toast.success("Data erased", `${data?.files_removed ?? 0} file(s) removed.`)
    await Promise.all([load(), onChanged()])
  }

  const decline = async () => {
    if (!declining) return
    setBusy(declining.id)
    try {
      const problem = await declineErasure(declining.id, note)
      if (problem) return toast.error("Not declined", problem)
      toast.success("Request declined", "The person is told why.")
      setDeclining(null)
      setNote("")
      await load()
    } catch (error) {
      toast.error("Not declined", errorText(error))
    } finally {
      setBusy(null)
    }
  }

  if (!rows?.length) return null
  return (
    <section aria-label="Data deletion requests" className="mb-4 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <h2 className="text-base font-extrabold">Data deletion requests <span className="ml-1 rounded-full bg-brand px-2 py-0.5 text-[11px] text-white">{rows.length}</span></h2>
      <p className="mt-1 text-xs text-fg-muted">Under the Data Privacy Act a person may ask for their data to be deleted. Decline only for a legal or safety reason, and say why.</p>
      <ul className="mt-3 divide-y divide-line">
        {rows.map((row) => {
          const person = who(row.user_id)
          return (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 text-sm">
                <p className="font-bold">{person?.full_name || person?.email || "Unknown person"} <span className="font-normal text-fg-muted">• asked {formatDate(row.created_at)}</span></p>
                {row.reason ? <p className="text-fg-muted">"{row.reason}"</p> : null}
              </div>
              <div className="flex gap-2">
                <button type="button" className={secondary} disabled={busy === row.id} onClick={() => { setDeclining(row); setNote("") }}>Decline</button>
                <button type="button" className={danger} disabled={busy === row.id} onClick={() => void erase(row)}>Erase data</button>
              </div>
            </li>
          )
        })}
      </ul>
      {declining ? (
        <Modal title="Decline this request" description="The person sees your reason." size="sm" onClose={() => setDeclining(null)} footer={<><button type="button" className={secondary} onClick={() => setDeclining(null)}>Cancel</button><button type="button" className={danger} disabled={note.trim().length < 5 || busy === declining.id} onClick={() => void decline()}>Decline request</button></>}>
          <label className="block text-sm font-semibold">
            Reason (at least 5 characters)
            <textarea value={note} maxLength={500} rows={3} onChange={(event) => setNote(event.target.value)} className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg" />
          </label>
        </Modal>
      ) : null}
    </section>
  )
}
