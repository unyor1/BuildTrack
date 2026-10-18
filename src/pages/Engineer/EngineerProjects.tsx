import FieldProjects from "../../components/FieldProjects"
import type { EngineerPageProps } from "./types"

// The Engineer's home: assigned projects only. Opening one shows that project's own sidebar.
export default function EngineerProjects(_: EngineerPageProps) {
  return <FieldProjects role="engineer" />
}
