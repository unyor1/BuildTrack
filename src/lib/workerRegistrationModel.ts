export type WorkerRegistration = {
  first_name: string
  last_name: string
  middle_initial: string
  contact_number: string
  email: string
  worker_code: string
  trade: string
  active: boolean
}
export const emptyWorkerRegistration: WorkerRegistration = {
  first_name: "",
  last_name: "",
  middle_initial: "",
  contact_number: "",
  email: "",
  worker_code: "",
  trade: "",
  active: true,
}
export const workerFullName = (value: WorkerRegistration) =>
  [
    value.first_name.trim(),
    value.middle_initial.trim().replace(/\.$/, "").toUpperCase()
      ? `${value.middle_initial.trim().replace(/\.$/, "").toUpperCase()}.`
      : "",
    value.last_name.trim(),
  ]
    .filter(Boolean)
    .join(" ")

export function workerRegistrationProblem(value: WorkerRegistration) {
  if (!value.first_name.trim() || !value.last_name.trim())
    return "First name and last name are required."
  if (value.first_name.trim().length > 70 || value.last_name.trim().length > 70)
    return "First name and last name must be 70 characters or fewer."
  if (
    value.middle_initial.trim() &&
    !/^\p{L}\.?$/u.test(value.middle_initial.trim())
  )
    return "Enter one letter for the middle initial."
  if (!/^[+\d() .-]{6,32}$/.test(value.contact_number.trim()))
    return "Enter a valid contact number (6–32 characters)."
  if (
    value.email.trim() &&
    (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email.trim()) ||
      value.email.trim().length > 254)
  )
    return "Enter a valid email address."
  if (!value.worker_code.trim() || value.worker_code.trim().length > 80)
    return "Worker code is required (up to 80 characters)."
  return ""
}
