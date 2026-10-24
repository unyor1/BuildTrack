import { useAuth } from "../lib/auth"
import { followLink } from "../lib/notifications"
import { panelRole, pinPlanPath, type PinSection } from "../lib/pinRecordsModel"
import { buttonSecondary } from "./ui/PageParts"

// "Open on blueprint" from any connected record: the signed-in role's plan page, on the record's sheet, with the pin selected and
// its panel open on the matching section. Nothing is shown without a pin (project-wide records) or for roles without a plan.
export default function OpenOnBlueprint({ projectId, pinId, sheetId, section = "details", label = "Open on blueprint", className = buttonSecondary }: {
  projectId: string
  pinId: string | null | undefined
  sheetId?: string | null
  section?: PinSection
  label?: string
  className?: string
}) {
  const { profile } = useAuth()
  const role = panelRole(profile?.role)
  if (!role || !pinId) return null
  return <button type="button" className={className} onClick={() => followLink(pinPlanPath(role, { projectId, pinId, sheetId, section }), projectId)}>{label}</button>
}
