// Pure helpers for notification emails (no Deno or network APIs, so they are unit-tested in Node by scripts/test-lib.mjs).
export type EmailJob = { id: string; kind: string; title: string; body: string | null; link: string | null; to_email: string; to_name: string | null }

export const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

// A usable absolute app address, or "" (then the email has no button and just says to open the app). Never trusts a stored link blindly.
export function appBase(value: string | null | undefined): string {
  try {
    const url = new URL(String(value ?? ""))
    return url.protocol === "https:" || url.hostname === "localhost" ? url.origin : ""
  } catch {
    return ""
  }
}

// Notification links are in-app paths such as /engineer/qa?project=<id>; only those are turned into addresses.
export function absoluteLink(base: string, link: string | null): string {
  if (!base || !link || !/^\/[a-z0-9/_-]*(\?[A-Za-z0-9=&_.-]*)?$/.test(link)) return ""
  return base + link
}

const firstName = (name: string | null) => (name ?? "").trim().split(/\s+/)[0] || "there"

export function buildEmail(job: EmailJob, appUrl: string) {
  const url = absoluteLink(appBase(appUrl), job.link)
  const greeting = `Hello ${firstName(job.to_name)},`
  const text = [greeting, "", job.title, job.body ?? "", "", url ? `Open it: ${url}` : "Open BuildTrack to see the details.", "", "You get this email because you have a BuildTrack account. You can switch emails off in the bell menu inside the app."].join("\n")
  const button = url ? `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#9E1F93;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;display:inline-block">Open in BuildTrack</a></p>` : `<p style="color:#555">Open BuildTrack to see the details.</p>`
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f5f2f5;font-family:Segoe UI,Arial,sans-serif;color:#1d1d1d"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="border-top:6px solid #9E1F93;background:#ffffff;border-radius:10px;padding:28px 28px 22px"><p style="margin:0 0 4px;color:#9E1F93;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Valencia Construction Services - BuildTrack</p><p style="margin:14px 0 0">${escapeHtml(greeting)}</p><h1 style="font-size:20px;margin:12px 0 8px">${escapeHtml(job.title)}</h1>${job.body ? `<p style="margin:0;line-height:1.5">${escapeHtml(job.body)}</p>` : ""}${button}<p style="margin:24px 0 0;color:#777;font-size:12px;border-top:1px solid #eee;padding-top:12px">You get this email because you have a BuildTrack account. You can switch emails off in the bell menu inside the app.</p></div></div></body></html>`
  return { subject: job.title.slice(0, 150), text, html }
}
