import { useState, type FormEvent } from "react"
import ProjectContextBar from "../../components/ProjectContextBar"
import { EmptyState, PageHead, buttonPrimary, inputClass } from "../../components/ui/PageParts"
import { SkeletonList } from "../../components/ui/Skeleton"
import { useProjectWork } from "../../lib/projectWork"
import { getSelectedProjectId } from "../../lib/projects"
import { reportError, useQuestions } from "../../lib/reports"
import { supabase } from "../../lib/supabase"
import { useToast } from "../../lib/toast"
import type { ClientPageProps } from "./types"

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })

// Ask the project team a question (about the project or one work item). The engineer answers here and you get a notification.
export default function ClientCommunication(_: ClientPageProps) {
  const projectId = getSelectedProjectId()
  const work = useProjectWork(projectId)
  const { questions, loading, error, reload } = useQuestions(projectId)
  const toast = useToast()
  const [text, setText] = useState("")
  const [pinId, setPinId] = useState("")
  const [problem, setProblem] = useState("")
  const [busy, setBusy] = useState(false)
  const pins = work.pins.filter((pin) => pin.category !== "note")

  const ask = async (event: FormEvent) => {
    event.preventDefault()
    if (!projectId) return
    if (text.trim().length < 3) return setProblem("Write your question (at least 3 characters).")
    setProblem("")
    setBusy(true)
    const { error: insertError } = await supabase.from("project_questions").insert({ project_id: projectId, pin_id: pinId || null, question: text.trim() })
    setBusy(false)
    if (insertError) {
      const message = /many questions/i.test(insertError.message) ? "You have asked many questions today. Please wait for answers." : reportError(insertError)
      setProblem(message)
      return toast.error("Question not sent", message)
    }
    toast.success("Question sent", "The engineer will answer here.")
    setText("")
    setPinId("")
    await reload()
  }

  return (
    <div className="client-page">
      <ProjectContextBar listPath="/client/overview" listLabel="My projects" />
      <PageHead eyebrow="Communication" title="Ask the team" description="Questions go to the project engineers. Their answers appear below and you get a notification." />
      {!projectId ? null : (
        <>
          <form onSubmit={(event) => void ask(event)} noValidate className="mb-6 rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <label className="block text-sm font-semibold">Your question
              <textarea className={`${inputClass} mt-1`} rows={3} maxLength={1000} value={text} onChange={(event) => setText(event.target.value)} placeholder="e.g. When will the lobby wall be finished?" />
            </label>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <label className="block min-w-[14rem] flex-1 text-sm font-semibold">About a work item (optional)
                <select className={`${inputClass} mt-1`} value={pinId} onChange={(event) => setPinId(event.target.value)}>
                  <option value="">The project in general</option>
                  {pins.map((pin) => <option key={pin.id} value={pin.id}>{pin.title} ({work.sheetOf(pin.blueprint_id)})</option>)}
                </select>
              </label>
              <button type="submit" className={buttonPrimary} disabled={busy}>{busy ? "Sending..." : "Send question"}</button>
            </div>
            {problem ? <p role="alert" className="mt-2 text-sm text-danger-fg">{problem}</p> : null}
          </form>

          <h2 className="mb-2 border-l-4 border-accent pl-3 text-base font-extrabold text-brand-strong">Your questions</h2>
          {loading ? (
            <SkeletonList rows={3} label="Loading your questions" />
          ) : error ? (
            <p role="alert" className="rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">{error}</p>
          ) : questions.length === 0 ? (
            <EmptyState title="No questions yet">Ask anything about the progress, schedule or a specific work item.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {questions.map((question) => (
                <li key={question.id} className="rounded-xl border border-line bg-surface p-4">
                  <p className="text-xs text-fg-muted">{when(question.created_at)}{question.pin_id ? ` • about "${work.pins.find((pin) => pin.id === question.pin_id)?.title ?? "a work item"}"` : ""}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-semibold">{question.question}</p>
                  {question.answer ? (
                    <div className="mt-3 rounded-lg bg-surface-muted p-3 text-sm">
                      <p className="text-xs font-bold text-brand-text">Answer from {work.nameOf(question.answered_by)}{question.answered_at ? ` • ${when(question.answered_at)}` : ""}</p>
                      <p className="mt-1 whitespace-pre-wrap">{question.answer}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">Waiting for an answer</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
