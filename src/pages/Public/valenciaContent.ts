import interior from "../../assets/valencia/introduction/interior-enhanced.png"
import logo from "../../assets/valencia/introduction/logo-transparent.png"
import residence from "../../assets/valencia/introduction/ticzon-perspective.jpg"
import residenceProgress from "../../assets/valencia/introduction/ticzon-residence.jpg"
import southlinks from "../../assets/valencia/introduction/southlinks-side.jpg"
import southlinksFront from "../../assets/valencia/introduction/southlinks-office.jpg"
import biocare from "../../assets/valencia/introduction/biocare-centuria.jpg"
import hlm from "../../assets/valencia/introduction/hlm-pharmaceutical.jpg"
import review from "../../assets/valencia/introduction/process-review.jpg"
import briefing from "../../assets/valencia/introduction/process-briefing.jpg"
import team from "../../assets/valencia/introduction/process-team.jpg"
import execution from "../../assets/valencia/introduction/process-execution.jpg"
import proprietorPhoto from "../../assets/valencia/introduction/proprietor-roxan-valencia.png"

// Public company information checked against the five Strikingly pages on 2026-10-21.
// Keep this independent of private project, worker and client data.
export const valenciaCompany = {
  name: "Valencia Construction Services",
  proprietor: "Roxan D. Valencia",
  proprietorPhoto,
  source: "https://valenciaconstructionservices.mystrikingly.com/",
  checkedOn: "2026-10-21",
  address: "Block 31, Berlin St., Purok 8, Sta. Ana, Taytay, Rizal, 1920",
  hours: "Monday–Saturday, 8:00 AM–5:00 PM",
  email: "valenciaconstruction2019@gmail.com",
  phones: ["09971270773", "09104292842"],
  interior,
  logo,
  southlinks,
}

export const companySections = [
  { label: "About", href: "#valencia-about" },
  { label: "Services", href: "#valencia-services" },
  { label: "Projects", href: "#valencia-projects" },
  { label: "Our process", href: "#valencia-process" },
  { label: "Contact", href: "#valencia-contact" },
]

export const companyHeaderNavigation = [
  { label: "BuildTrack", href: "/buildtrack" },
  ...companySections,
]

export const valenciaServices = [
  { number: "01", icon: "building", title: "Sales offices", description: "Client-ready spaces that bring a development's identity into a welcoming, professional setting." },
  { number: "02", icon: "blueprint", title: "Commercial fit-outs", description: "Practical interiors planned around the way your business works, with space for people to do their best." },
  { number: "03", icon: "shield", title: "Civil works", description: "Site preparation, foundations and civil construction, carried out with attention to precision and dependable workmanship." },
  { number: "04", icon: "eye", title: "Architectural works", description: "From layout installation to final finishes, careful execution that brings the architectural plan into the built space." },
] as const

export type ValenciaProject = {
  id: string
  name: string
  category: "Residential" | "Sales offices" | "Commercial"
  description: string
  sourceStatus?: string
  photos: { src: string; caption: string }[]
}

export const valenciaProjects: ValenciaProject[] = [
  {
    id: "southlinks",
    name: "Southlinks Estate Temporary Sales Office",
    category: "Sales offices",
    description: "A sales-office project bringing together a welcoming interior, architectural detail and a professional space for client conversations.",
    photos: [
      { src: southlinks, caption: "Southlinks Estate · sales-office exterior" },
      { src: southlinksFront, caption: "Southlinks Estate · front exterior and landscaped approach" },
      { src: interior, caption: "Southlinks interior · enhanced presentation photograph" },
    ],
  },
  {
    id: "ticzon",
    name: "Ticzon Residence",
    category: "Residential",
    description: "Residential construction in Barangay Bel-Air, Makati, with attention to the home from its structure through its finishing details.",
    photos: [
      { src: residence, caption: "Ticzon Residence · architectural perspective, not a completion photograph" },
      { src: residenceProgress, caption: "Ticzon Residence · construction photograph published by Valencia" },
    ],
  },
  {
    id: "biocare",
    name: "Biocare Centuria",
    category: "Commercial",
    description: "Commercial project featured in Valencia's published portfolio.",
    sourceStatus: "Listed as ongoing on the source website",
    photos: [{ src: biocare, caption: "Biocare Centuria · published project image" }],
  },
  {
    id: "hlm",
    name: "HLM Pharmaceutical",
    category: "Commercial",
    description: "Pharmaceutical project featured in Valencia's published portfolio.",
    sourceStatus: "Listed as ongoing on the source website",
    photos: [{ src: hlm, caption: "HLM Pharmaceutical · published project image" }],
  },
]

export const valenciaProcess = [
  { number: "01", title: "Review the plans", image: review, description: "Check drawings, specifications and feasibility before site work starts." },
  { number: "02", title: "Align the team", image: briefing, description: "Agree on scope, responsibilities, safety and the work schedule." },
  { number: "03", title: "Prepare to build", image: team, description: "Bring a coordinated, properly equipped team together for execution." },
  { number: "04", title: "Put plans into motion", image: execution, description: "Mobilize the work using the approved methods and safety requirements." },
]

export function companyInquiryMailto(name: string, email: string, message: string) {
  const subject = "Project inquiry — Valencia Construction Services"
  const body = `Name: ${name.trim()}\nEmail: ${email.trim()}\n\n${message.trim()}`
  return `mailto:${valenciaCompany.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
