import { useEffect, useState } from "react"
import type { Page } from "../../App"
import Brand from "../../components/Brand"
import Modal from "../../components/Modal"
import { handlePublicNavigation } from "../../lib/publicNavigation"
import { companyHeaderNavigation } from "./valenciaContent"

export default function ValenciaMobileNavigation({ navigate }: { navigate: (page: Page, hash?: string) => void }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const desktop = window.matchMedia("(min-width: 1101px)")
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false) }
    closeOnDesktop()
    desktop.addEventListener("change", closeOnDesktop)
    return () => desktop.removeEventListener("change", closeOnDesktop)
  }, [open])

  return (
    <>
      <button type="button" className="valencia-menu-toggle" aria-label="Open navigation menu" aria-expanded={open} aria-controls="valencia-mobile-navigation" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>
      {open ? <Modal title="Valencia navigation" placement="right" onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-6">
          <Brand />
          <nav id="valencia-mobile-navigation" className="flex flex-col gap-2" aria-label="Mobile company navigation">
            {companyHeaderNavigation.map(link => <a key={link.href} href={link.href} className="flex min-h-12 items-center justify-between gap-4 rounded-xl px-4 py-3 text-sm font-bold text-fg transition hover:bg-brand-soft hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" onClick={event => {
              handlePublicNavigation(event, link.href, navigate)
              if (event.defaultPrevented) setOpen(false)
            }}>{link.label}<span aria-hidden="true">↗</span></a>)}
          </nav>
        </div>
      </Modal> : null}
    </>
  )
}
