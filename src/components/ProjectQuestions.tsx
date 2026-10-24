import { useEffect, useState } from "react"
import OpenOnBlueprint from "./OpenOnBlueprint"
import { EmptyState, buttonPrimary, inputClass } from "./ui/PageParts"
import { SkeletonList } from "./ui/Skeleton"
import type { ProjectQuestion } from "../lib/reports"
import { supabase } from "../lib/supabase"
import { useToast } from "../lib/toast"

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
export type LinkedPin = { title: string; sheetId: string }

// Client questions with the Engineer answer form (answer_question notifies the client). Used on Engineer Reports and in the
// pin panel Communication section; a question about a pin links back to it on the blueprint.
export default function ProjectQuestions({ questions, loading, error, nameOf, pinOf, onAnswered, emptyText = "Questions the client asks about the project or a pin show up here, and you get a notification." }: { questions: ProjectQuestion[]; loading: boolean; error: string; nameOf: (id: string | null) => string; pinOf: (id: string) => LinkedPin | null; onAnswered: () => void | Promise<void>; emptyText?: string }) {
  const toast = useToast()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [wanted, setWanted] = useState(() => new URLSearchParams(window.location.search).get("question"))
  useEffect(() => { const changed = () => setWanted(new URLSearchParams(window.location.search).get("question")); window.addEventListener("popstate", changed); return () => window.removeEventListener("popstate", changed) }, [])
  useEffect(() => { if (wanted && questions.some(question => question.id === wanted)) document.getElementById(`client-question-${wanted}`)?.scrollIntoView({ block: "center", behavior: "smooth" }) }, [wanted, questions])
  const sorted = [...questions].sort((a, b) => Number(Boolean(a.answer)) - Number(Boolean(b.answer)) || b.created_at.localeCompare(a.created_at))

  const answer = async (question: ProjectQuestion) => {
    const text = (drafts[question.id] ?? "").trim()
    if (!text) return toast.error("Write an answer first")
    setBusy(question.id)
    const { error: rpcError } = await supabase.rpc("answer_question", { p_id: question.id, p_answer: text }).then(result => result, () => ({ error: { message: "Connection interrupted. Check the saved answer before trying again." } }))
    setBusy(null)
    if (rpcError) return toast.error("Not sent", rpcError.message)
    toast.success("Answer sent", `${nameOf(question.author_id)} is notified`)
    setDrafts((current) => ({ ...current, [question.id]: "" }))
    await onAnswered()
  }

  if (loading) return <SkeletonList rows={3} label="Loading questions" />
  if (error) return <p role="alert" className="rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{error}</p>
  if (!sorted.length) return <EmptyState title="No questions from the client">{emptyText}</EmptyState>
  return (
    <ul className="space-y-3">
      {sorted.map((question) => (
        <li id={`client-question-${question.id}`} key={question.id} className={`rounded-xl border bg-surface p-4 ${question.answer && question.id !== wanted ? "border-line" : "border-brand"} ${question.id === wanted ? "ring-1 ring-brand" : ""}`}>
          <p className="text-xs text-fg-muted">{nameOf(question.author_id)} • {when(question.created_at)}{question.pin_id && pinOf(question.pin_id) ? ` • about "${pinOf(question.pin_id)?.title}"` : ""}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm font-semibold">{question.question}</p>
          {question.pin_id && pinOf(question.pin_id) ? <div className="mt-2"><OpenOnBlueprint projectId={question.project_id} pinId={question.pin_id} sheetId={pinOf(question.pin_id)?.sheetId} section="communication" label="Open on blueprint" className="text-xs font-bold text-brand-text underline" /></div> : null}
          {question.answer ? (
            <div className="mt-3 rounded-lg bg-surface-muted p-3 text-sm">
              <p className="text-xs font-bold text-brand-text">Answered by {nameOf(question.answered_by)} • {question.answered_at ? when(question.answered_at) : ""}</p>
              <p className="mt-1 whitespace-pre-wrap">{question.answer}</p>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor={`answer-${question.id}`}>Answer</label>
              <textarea id={`answer-${question.id}`} rows={2} maxLength={2000} value={drafts[question.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [question.id]: event.target.value }))} placeholder="Write a clear answer in plain language." className={`${inputClass} flex-1`} />
              <button type="button" className={buttonPrimary + " self-end"} disabled={busy === question.id} onClick={() => void answer(question)}>{busy === question.id ? "Sending..." : "Send answer"}</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
