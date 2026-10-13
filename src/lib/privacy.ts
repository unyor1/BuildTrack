// Data privacy notice text (Data Privacy Act of 2012, RA 10173). One place for the wording so every screen says the same thing.
// The version is stored with each consent: change it when the notice changes and people are asked again where it matters.
export const PRIVACY_VERSION = "2026-10-13"

export type PrivacyScope = "registration" | "identity" | "profile" | "admin_account" | "whitelist" | "client_report" | "general"

export type ScopeNotice = {
  title: string
  collects: string[]
  purpose: string
  access: string
  keptFor: string
}

export const privacyScopes: Record<PrivacyScope, ScopeNotice> = {
  general: {
    title: "How BuildTrack handles personal data",
    collects: ["Your name, email, phone number, company and job title", "Your activity in the app (reports, photos, comments, approvals)", "When you add a site photo: your phone's time and, only if you allow it, its GPS position and accuracy, to show the photo was taken at the project site", "Your device and sign-in details needed to keep the account secure"],
    purpose: "To run construction projects: assign work, record progress and quality, keep an audit trail, check that evidence photos come from the site, and keep the system secure.",
    access: "Your project team and the administrators of Valencia Construction Services, only as far as their role needs.",
    keptFor: "While your account is active and as long as project records must be kept for legal, contractual or safety reasons.",
  },
  registration: {
    title: "Creating your BuildTrack account",
    collects: ["Full name", "Email address", "Phone number", "Company and job title"],
    purpose: "To create your account, confirm that you are who you say you are, and let administrators decide what you may access.",
    access: "Administrators of Valencia Construction Services.",
    keptFor: "While your account exists. You can ask for it to be closed.",
  },
  identity: {
    title: "Verifying your identity",
    collects: ["Legal name, birth date and home address", "Type of government ID, the last 4 characters of its number and its expiry date", "Photos of your ID (front, back where it has one) and a selfie holding it"],
    purpose: "To confirm that you are a real, identifiable person before you are given access to project data. The documents are used for this check only.",
    access: "Only you and administrators who are allowed to approve users. Each time an administrator opens your documents it is recorded in the audit log. Nobody else, including your project team and clients, can see them.",
    keptFor: "The images are kept only for the review and are deleted by an administrator after the decision. The decision and the last 4 characters of the ID number stay on record.",
  },
  profile: {
    title: "Changing your profile",
    collects: ["The details you edit (name, phone, company, job title, photo)"],
    purpose: "To keep your account details correct and to show your name to your project team.",
    access: "Your project team and administrators.",
    keptFor: "While your account exists.",
  },
  admin_account: {
    title: "Creating or editing someone else's account",
    collects: ["The person's name, email, phone, company, job title and role"],
    purpose: "To give a trusted person an account with the right role. You act on the company's behalf and must have the person's permission to register their details.",
    access: "Administrators of Valencia Construction Services. Your action is recorded in the audit log.",
    keptFor: "While the account exists.",
  },
  whitelist: {
    title: "Pre-approving email addresses",
    collects: ["Email addresses of people you trust, and the role they will get"],
    purpose: "To give those people their role automatically when they confirm their email.",
    access: "Administrators who may review users. Your action is recorded in the audit log.",
    keptFor: "Until the entry is used or removed; used entries stay as history.",
  },
  client_report: {
    title: "Reporting a problem",
    collects: ["What is wrong, where it is, how urgent it is", "Photos you attach (they may show people or private areas)"],
    purpose: "To let the project engineer assess and fix the problem and to show you its progress.",
    access: "You, the project engineers and foremen, and administrators.",
    keptFor: "As part of the project's quality records.",
  },
}

export const privacyRights = [
  "Be informed about how your data is processed.",
  "Access the personal data we hold about you.",
  "Object to processing, or withdraw your consent, where the law allows.",
  "Ask us to correct wrong data, and to block or remove data that is no longer needed.",
  "Claim compensation if you are harmed by unlawful use of your data.",
  "Move your data to another service where it applies.",
  "Complain to the National Privacy Commission (privacy.gov.ph).",
]

export const privacyCommon = [
  "We collect only what is needed for the purpose shown, and we do not sell it.",
  "Data is stored in a secured database; documents are in private storage with access rules and an audit trail.",
  "Administrators who handle personal data must pass a second authentication step.",
  "To use your rights, contact the Data Protection Officer of Valencia Construction Services through your administrator.",
]

// A short, human summary of what a form collected, used in the confirmation modal.
export type SummaryRow = { label: string; value: string }
export const hasValue = (row: SummaryRow) => row.value.trim() !== ""
