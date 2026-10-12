import type { ReactNode } from "react"
import AppShell from "../../components/shell/AppShell"
import type { UserNavigate, UserPageKey } from "./types"

// Layout for basic accounts (new sign-ups). Project panels appear after an administrator approves a request for Engineer, Foreman or Client.
export default function UserShell({
  activePage,
  onNavigate,
  children,
}: {
  activePage: UserPageKey
  onNavigate: UserNavigate
  children: ReactNode
}) {
  return (
    <AppShell
      persona="user"
      workspace="My account"
      groups={[{ label: "Account", items: [{ key: "home", label: "My account", icon: "home" }] }]}
      active={activePage}
      onNavigate={(key) => onNavigate(key as UserPageKey)}
    >
      <div className="mx-auto w-full max-w-[1200px]">{children}</div>
    </AppShell>
  )
}
