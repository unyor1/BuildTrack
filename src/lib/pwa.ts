import { useEffect, useState } from "react"

// Installable app (PWA): registers the service worker in production, reports "a new version is ready", and keeps the browser's
// install prompt so the app can offer its own "Install" button.

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

let waiting: ServiceWorker | null = null
let installEvent: InstallPrompt | null = null
const UPDATE = "buildtrack:update"
const INSTALL = "buildtrack:install"

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        const announce = (worker: ServiceWorker | null) => {
          if (worker && navigator.serviceWorker.controller) {
            waiting = worker
            window.dispatchEvent(new Event(UPDATE))
          }
        }
        announce(registration.waiting)
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing
          worker?.addEventListener("statechange", () => worker.state === "installed" && announce(worker))
        })
        // Look for a new version when the person comes back to the app.
        document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void registration.update().catch(() => undefined))
      })
      .catch(() => undefined) // the app works without it
    let reloading = false
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    })
  })
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    installEvent = event as InstallPrompt
    window.dispatchEvent(new Event(INSTALL))
  })
  window.addEventListener("appinstalled", () => {
    installEvent = null
    window.dispatchEvent(new Event(INSTALL))
  })
}

export const applyUpdate = () => waiting?.postMessage({ type: "SKIP_WAITING" })

export async function promptInstall(): Promise<boolean> {
  if (!installEvent) return false
  await installEvent.prompt()
  const choice = await installEvent.userChoice
  installEvent = null
  window.dispatchEvent(new Event(INSTALL))
  return choice.outcome === "accepted"
}

export function usePwa() {
  const [, tick] = useState(0)
  useEffect(() => {
    const refresh = () => tick((value) => value + 1)
    window.addEventListener(UPDATE, refresh)
    window.addEventListener(INSTALL, refresh)
    return () => {
      window.removeEventListener(UPDATE, refresh)
      window.removeEventListener(INSTALL, refresh)
    }
  }, [])
  const standalone = typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
  return { updateReady: Boolean(waiting), canInstall: Boolean(installEvent) && !standalone }
}
