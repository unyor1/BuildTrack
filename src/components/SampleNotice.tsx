// Shown above screens that still use sample data, so nobody mistakes the numbers for real project data.
export default function SampleNotice({ note }: { note?: string }) {
  return (
    <div role="note" className="mx-auto mb-4 flex max-w-5xl items-start gap-3 rounded-xl border border-amber-400/60 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
      <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-amber-500 text-xs font-extrabold text-black" aria-hidden="true">!</span>
      <p><strong>Sample data.</strong> {note ?? "This screen is not connected to your project yet. The names and numbers are examples."}</p>
    </div>
  )
}
