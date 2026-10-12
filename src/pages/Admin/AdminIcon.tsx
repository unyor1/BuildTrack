import type { ReactNode } from "react"

export type AdminIconName = "grid" | "users" | "fingerprint" | "building" | "blueprint" | "pin" | "chart" | "history" | "settings" | "menu" | "arrow" | "plus" | "search" | "chevron" | "check" | "close" | "calendar" | "upload" | "download" | "eye" | "edit" | "more" | "lock" | "shield" | "clipboard" | "camera" | "logout" | "panel" | "command" | "idcard" | "key" | "help" | "sun" | "moon" | "home" | "inbox" | "file" | "trash"

const paths: Record<AdminIconName, ReactNode> = {
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-4 2-7 6-7s6 3 6 7M16 5c3 0 4 2 4 4s-1 3-3 3M17 14c3 1 4 3 4 6" />
    </>
  ),
  fingerprint: (
    <>
      <path d="M12 4a7 7 0 0 1 7 7v2M12 7a4 4 0 0 1 4 4v3M12 10a1 1 0 0 1 1 1v5a4 4 0 0 1-4 4M8 11a4 4 0 0 0-1 3v1M4 12a8 8 0 0 0 1 4M12 4a7 7 0 0 0-7 7v1" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V7l8-4v18M12 9h8v12M8 8v2M8 13v2M8 18v2M16 13v2M16 18v2M2 21h20" />
    </>
  ),
  blueprint: (
    <>
      <path d="M5 3h10l4 4v14H5zM15 3v5h5M9 12h6M9 16h4" />
      <path d="m7 7 2-2m-2 7 2-2" />
    </>
  ),
  pin: (
    <>
      <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
      <circle cx="12" cy="10" r="2" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5M12 7v5l3 2" />
    </>
  ),
  settings: (
    <>
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
      <path d="m4.9 4.9 1.4 1.4M17.7 6.3l1.4-1.4M4 12H2m20 0h-2M4.9 19.1l1.4-1.4m11.4 0 1.4 1.4M12 4V2m0 20v-2" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  chevron: <path d="m7 10 5 5 5-5" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4M17 3v4M3 10h18" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4m0 0L8 8m4-4 4 4" />
      <path d="M5 14v5h14v-5" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v12m0 0 4-4m-4 4-4-4" />
      <path d="M5 20h14" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  edit: (
    <>
      <path d="m4 16-.8 4.8L8 20l10.7-10.7a2.3 2.3 0 0 0-3.2-3.2L4 16Z" />
      <path d="m14 7 3 3" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.8 3.2 8 7.5 9.5 4.3-1.5 7.5-4.7 7.5-9.5V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),  clipboard: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4h6v3H9zM9 12h6M9 16h4" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h-8a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h8" />
      <path d="M11 12h10m-3-3 3 3-3 3" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </>
  ),
  command: <path d="M9 9V7a2 2 0 1 0-2 2h10a2 2 0 1 0-2-2v10a2 2 0 1 0 2-2H7a2 2 0 1 0 2 2V9" />,
  idcard: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.5-1.7 1.7-2.5 3-2.5s2.5.8 3 2.5M14 10h4M14 13h3" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 8-8m-3 3 2 2m-5 1 2 2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17v.01" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2m0 14v2M3 12h2m14 0h2m-15.4-6.4 1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />,
  home: <path d="m3 11 9-7 9 7M5 10v10h5v-6h4v6h5V10" />,
  file: (
    <>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h4M9 13h6M9 17h4" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  inbox: (
    <>
      <path d="M4 13 6.5 5h11L20 13M4 13v6h16v-6M4 13h4l1 2h6l1-2h4" />
    </>
  ),
}

export default function AdminIcon({ name }: { name: AdminIconName }) {
  return (
    <svg
      className="admin-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
