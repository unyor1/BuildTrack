import EditorForSelectedProject from "../../components/EditorForSelectedProject"
import type { EngineerPageProps } from "./types"

// The Engineer's workspace: toolbar, sheet sorter, stage and inspector, filling the whole window.
export default function EngineerBlueprintAnnotation({ onNavigate }: EngineerPageProps) {
  return <EditorForSelectedProject role="engineer" canEdit onExit={() => onNavigate("project-blueprint")} listLabel="Back to my projects" />
}
