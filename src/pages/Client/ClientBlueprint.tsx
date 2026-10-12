import EditorForSelectedProject from "../../components/EditorForSelectedProject"
import type { ClientPageProps } from "./types"

// Read-only view of the plans and pins for the client.
export default function ClientBlueprint({ onNavigate }: ClientPageProps) {
  return <EditorForSelectedProject role="client" canEdit={false} onExit={() => onNavigate("overview")} listLabel="Back to my projects" />
}
