// Shared by the library preview and live inspection: these are recorded instructions, not an automatic compliance verdict.
export default function QaRequirements({ item }: { item: { acceptance_criteria?: string | null; evidence_requirement?: string | null } }) {
  if (!item.acceptance_criteria && !item.evidence_requirement) return null
  return (
    <dl className="mt-2 space-y-2 rounded-lg bg-surface-muted p-3 text-xs">
      {item.acceptance_criteria ? <div><dt className="font-extrabold">Acceptance criteria</dt><dd className="mt-1 whitespace-pre-wrap break-words">{item.acceptance_criteria}</dd></div> : null}
      {item.evidence_requirement ? <div><dt className="font-extrabold">Required evidence / test</dt><dd className="mt-1 whitespace-pre-wrap break-words">{item.evidence_requirement}</dd></div> : null}
    </dl>
  )
}
