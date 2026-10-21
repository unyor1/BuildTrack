import { useEffect, type MouseEvent } from "react"
import type { Page } from "../App"

// Keep normal anchor semantics for external links, downloads, modified clicks and new tabs.
// Only the two public pages are handled here; workspace authorization/routing stays unchanged.
export function handlePublicNavigation(event: MouseEvent<HTMLAnchorElement>, href: string, navigate: (page: Page, hash?: string) => void) {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  const target = event.currentTarget.getAttribute("target")
  if ((target && target !== "_self") || event.currentTarget.hasAttribute("download")) return
  let destination: URL
  try { destination = new URL(href, window.location.href) } catch { return }
  if (destination.origin !== window.location.origin || destination.search) return
  const path = destination.pathname.replace(/\/$/, "")
  const page = path === "/valencia" ? "valencia" : path === "/buildtrack" ? "home" : null
  if (!page) return
  event.preventDefault()
  navigate(page, destination.hash)
}

// A public page may mount after its lazy chunk/account check, later than native fragment scrolling.
// Run after commit and on hash/back-forward changes so section links always find the rendered target.
export function usePublicHashScroll() {
  useEffect(() => {
    const scroll = () => {
      if (!window.location.hash) return
      let id: string
      try { id = decodeURIComponent(window.location.hash.slice(1)) } catch { return }
      document.getElementById(id)?.scrollIntoView({ block: "start" })
    }
    scroll()
    window.addEventListener("hashchange", scroll)
    window.addEventListener("popstate", scroll)
    return () => {
      window.removeEventListener("hashchange", scroll)
      window.removeEventListener("popstate", scroll)
    }
  }, [])
}
