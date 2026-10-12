// Pure rules for the identity verification form (the database repeats them; this gives the person instant, readable feedback).
export type IdType = "philsys" | "passport" | "drivers_license" | "umid" | "prc" | "postal" | "voters" | "sss" | "philhealth" | "tin" | "senior_citizen" | "other"
export type IdentityStatus = "unverified" | "pending" | "verified" | "rejected"

export const idTypes: Array<{ value: IdType; label: string; hasBack: boolean }> = [
  { value: "philsys", label: "Philippine National ID (PhilSys)", hasBack: true },
  { value: "passport", label: "Passport", hasBack: false },
  { value: "drivers_license", label: "Driver's license (LTO)", hasBack: true },
  { value: "umid", label: "UMID", hasBack: true },
  { value: "prc", label: "PRC ID", hasBack: true },
  { value: "postal", label: "Postal ID", hasBack: true },
  { value: "voters", label: "Voter's ID", hasBack: true },
  { value: "sss", label: "SSS ID", hasBack: true },
  { value: "philhealth", label: "PhilHealth ID", hasBack: true },
  { value: "tin", label: "TIN ID", hasBack: true },
  { value: "senior_citizen", label: "Senior Citizen ID", hasBack: true },
  { value: "other", label: "Other government-issued photo ID", hasBack: true },
]
export const idTypeLabel = (value: string) => idTypes.find((item) => item.value === value)?.label ?? value

export const identityStatusLabel: Record<IdentityStatus, string> = { unverified: "Not verified", pending: "Under review", verified: "Verified", rejected: "Needs correction" }
export const identityTone: Record<IdentityStatus, string> = {
  unverified: "bg-gray-200 text-gray-700 dark:bg-gray-700/60 dark:text-gray-200",
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  verified: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
}

export type IdentityDraft = {
  legalName: string
  birthDate: string // yyyy-mm-dd
  address: string
  phone: string
  idType: IdType | ""
  idLast4: string
  idExpiry: string // yyyy-mm-dd or ""
}

export const ageOn = (birthDate: string, today: string): number | null => {
  const born = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? birthDate : ""
  if (!born) return null
  const [by, bm, bd] = born.split("-").map(Number)
  const [ty, tm, td] = today.split("-").map(Number)
  let age = ty - by
  if (tm < bm || (tm === bm && td < bd)) age--
  return age
}

// First problem in the details step, as a sentence the person can act on ("" when fine).
export function detailsProblem(draft: IdentityDraft, today: string): string {
  if (draft.legalName.trim().length < 2) return "Enter your full legal name exactly as it appears on your ID."
  const age = ageOn(draft.birthDate, today)
  if (age === null) return "Enter your date of birth."
  if (age < 18) return "You must be at least 18 years old to be verified."
  if (age > 110) return "Check your date of birth."
  if (draft.address.trim().length < 10) return "Enter your complete home address (street, barangay, city)."
  if (!/^[0-9+()./ -]{7,40}$/.test(draft.phone.trim())) return "Enter a valid phone number, for example +63 912 345 6789."
  if (!draft.idType) return "Choose the type of ID you will upload."
  if (!/^[A-Za-z0-9]{3,4}$/.test(draft.idLast4.trim())) return "Enter the last 3 or 4 characters of your ID number."
  if (draft.idExpiry && draft.idExpiry < today) return "That ID has expired. Use an ID that is still valid."
  return ""
}

export const MAX_ID_FILE_BYTES = 20 * 1024 * 1024

export function fileProblem(file: File | null | undefined): string {
  if (!file) return "Choose a photo."
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return "Use a JPEG, PNG or WebP photo."
  if (file.size === 0) return "That file is empty."
  if (file.size > MAX_ID_FILE_BYTES) return "That photo is too large (limit 20 MB)."
  return ""
}

// Mask for lists: ID number is never stored, only its last characters.
export const maskedId = (last4: string) => `•••• ${last4.toUpperCase()}`
