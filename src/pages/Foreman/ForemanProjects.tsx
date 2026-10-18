import FieldProjects from "../../components/FieldProjects"
import type { ForemanPageProps } from "./types"

// The Foreman's home: assigned projects only. Opening one shows that project's own sidebar.
export default function ForemanProjects(_: ForemanPageProps) {
  return <FieldProjects role="foreman" />
}
