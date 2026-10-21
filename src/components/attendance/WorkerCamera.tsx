import { useEffect, useRef, useState } from "react"
import { workerPhotoProblem } from "../../lib/attendanceModel"

type Props = {
  value: File | null
  onChange: (photo: File | null) => void
  disabled?: boolean
}

const control = "rounded-xl border border-border px-4 py-2 text-xs font-bold disabled:opacity-50"

export default function WorkerCamera({ value, onChange, disabled = false }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const generation = useRef(0)
  const [mode, setMode] = useState<"idle" | "starting" | "live">("idle")
  const [ready, setReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState("")
  const [preview, setPreview] = useState("")

  function release() {
    generation.current++
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    if (video.current) video.current.srcObject = null
  }

  function close() {
    release()
    setMode("idle")
    setReady(false)
    setCapturing(false)
  }

  // Also invalidate a permission request that resolves after navigation or a worker switch.
  useEffect(() => () => release(), [])
  useEffect(() => {
    if (disabled) close()
  }, [disabled])
  useEffect(() => {
    if (!value) {
      setPreview("")
      return
    }
    const url = URL.createObjectURL(value)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [value])
  useEffect(() => {
    if (mode !== "live" || !video.current || !stream.current) return
    const element = video.current
    const request = generation.current
    element.srcObject = stream.current
    void element.play().catch(() => {
      if (request !== generation.current) return
      close()
      setError("Camera preview could not start. Close other camera apps and try again.")
    })
  }, [mode])

  async function open() {
    if (disabled || mode !== "idle") return
    setError("")
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera capture requires HTTPS or localhost and a browser with camera support.")
      return
    }
    release()
    const request = generation.current
    setReady(false)
    setMode("starting")
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
      })
      if (request !== generation.current) {
        acquired.getTracks().forEach(track => track.stop())
        return
      }
      stream.current = acquired
      setMode("live")
    } catch (problem) {
      if (request !== generation.current) return
      close()
      const name = (problem as { name?: string }).name
      setError(name === "NotAllowedError" || name === "SecurityError"
        ? "Camera access was blocked. Allow camera access in your browser/site settings, then try again."
        : name === "NotFoundError"
          ? "No camera was found. Connect a webcam or use a device with a camera."
          : "Could not open the camera. Close other camera apps and try again.")
    }
  }

  async function capture() {
    const element = video.current
    if (disabled || capturing || !ready || !element?.videoWidth || !element.videoHeight) return
    setCapturing(true)
    setError("")
    const request = generation.current
    try {
      const canvas = document.createElement("canvas")
      const ratio = Math.min(1, 1024 / Math.max(element.videoWidth, element.videoHeight))
      canvas.width = Math.max(1, Math.round(element.videoWidth * ratio))
      canvas.height = Math.max(1, Math.round(element.videoHeight * ratio))
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Camera image could not be created. Please retry.")
      context.drawImage(element, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85))
      if (request !== generation.current) return
      if (!blob) throw new Error("Camera image could not be created. Please retry.")
      const photo = new File([blob], `worker-portrait-${Date.now()}.jpg`, { type: "image/jpeg" })
      const problem = workerPhotoProblem(photo)
      if (problem) throw new Error(problem)
      close()
      onChange(photo)
    } catch (problem) {
      if (request !== generation.current) return
      setCapturing(false)
      setError(problem instanceof Error ? problem.message : "Could not capture the photo. Please retry.")
    }
  }

  return (
    <section aria-label="Worker profile photo" className="space-y-3 rounded-xl border border-border p-3">
      <h3 className="text-xs font-bold">Profile photo</h3>
      {mode === "live" ? (
        <video ref={video} autoPlay playsInline muted aria-label="Live worker camera preview"
          className="aspect-[4/3] w-full rounded-lg bg-black object-contain"
          onLoadedData={() => setReady(true)}
          onError={() => { close(); setError("Camera preview failed. Please try again.") }} />
      ) : preview ? (
        <img src={preview} alt="Captured worker profile photo" className="max-h-64 w-full rounded-lg object-contain" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        {mode === "idle" ? (
          <button type="button" className={control} disabled={disabled} onClick={() => void open()}>
            {value ? "Retake photo" : "Open camera"}
          </button>
        ) : (
          <>
            <button type="button" className={control} disabled={disabled || !ready || capturing} onClick={() => void capture()}>
              {capturing ? "Capturing…" : "Capture photo"}
            </button>
            <button type="button" className={control} disabled={disabled} onClick={close}>Cancel camera</button>
          </>
        )}
        {value && mode === "idle" && <button type="button" className={control} disabled={disabled} onClick={() => onChange(null)}>Discard capture</button>}
      </div>
      {mode === "starting" && <p role="status" className="text-xs text-fg-muted">Waiting for camera permission…</p>}
      {value && mode === "idle" && <p role="status" className="text-xs text-fg-muted">Photo captured. Save the worker profile to upload it.</p>}
      <p className="text-xs text-fg-muted">Take the worker’s portrait using this device’s camera. HTTPS or localhost and camera permission are required. The photo is saved to private project storage only when you save the profile.</p>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </section>
  )
}
