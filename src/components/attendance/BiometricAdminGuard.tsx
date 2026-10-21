import type { ReactNode } from "react"
import { useAuth } from "../../lib/auth"

// Also protect the management components if a future page mounts them outside the Admin route.
// can() includes active-account, admin permission and MFA checks; a permission alone never delegates to a Foreman.
export default function BiometricAdminGuard({
  children,
}: {
  children: ReactNode
}) {
  const { profile, can } = useAuth()
  const admin = profile?.role === "admin" || profile?.role === "super_admin"
  if (!admin || !can("biometrics.manage"))
    return (
      <p
        role="alert"
        className="rounded-xl border border-border bg-surface p-4 text-sm text-fg-muted"
      >
        Worker biometric registration and device management are restricted to
        Admins with biometric management permission. Foremen can view attendance
        only.
      </p>
    )
  return <>{children}</>
}
