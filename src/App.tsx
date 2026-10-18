import { Component, Suspense, lazy, type ReactNode } from "react"
import AppStatus from "./components/AppStatus"
import ErrorBoundary from "./components/ErrorBoundary"
import { SkeletonCardGrid } from "./components/ui/Skeleton"
import RouteGuard from "./components/RouteGuard"
import ProjectWorkspace from "./pages/Admin/ProjectWorkspace"
import { fieldPagePath, projectPath, projectSections, readProjectRoute, type ProjectSection } from "./lib/projectRoutes"
import { getSelectedProjectId } from "./lib/projects"
const LandingPage = lazy(() => import("./pages/Public/LandingPage"))
const PinLink = lazy(() => import("./pages/Public/PinLink"))
const LoginPage = lazy(() => import("./pages/Auth/LoginPage"))
const RegisterPage = lazy(() => import("./pages/Auth/RegisterPage"))
import AdminShell from "./pages/Admin/AdminShell"
const AdminDashboard = lazy(() => import("./pages/Admin/AdminDashboard"))
const UserManagement = lazy(() => import("./pages/Admin/UserManagement"))
const BiometricsRegistration = lazy(() => import("./pages/Admin/BiometricsRegistration"))
const ProjectManagement = lazy(() => import("./pages/Admin/ProjectManagement"))
const BlueprintUpload = lazy(() => import("./pages/Admin/BlueprintUpload"))
const BlueprintMapping = lazy(() => import("./pages/Admin/BlueprintMapping"))
const BlueprintProgressTracking = lazy(() => import("./pages/Admin/BlueprintProgressTracking"))
const BlueprintVersionControl = lazy(() => import("./pages/Admin/BlueprintVersionControl"))
const ProjectOverview = lazy(() => import("./pages/Admin/ProjectOverview"))
const InviteCodes = lazy(() => import("./pages/Admin/InviteCodes"))
const AuditLog = lazy(() => import("./pages/Admin/AuditLog"))
const SystemSettings = lazy(() => import("./pages/Admin/SystemSettings"))
const AdminQaChecklists = lazy(() => import("./pages/Admin/AdminQaChecklists"))
const AccessReview = lazy(() => import("./pages/Admin/AccessReview"))
const ProjectBackup = lazy(() => import("./pages/Admin/ProjectBackup"))
import type { AdminPageKey } from "./pages/Admin/types"
import EngineerShell from "./pages/Engineer/EngineerShell"
const EngineerDashboard = lazy(() => import("./pages/Engineer/EngineerDashboard"))
const EngineerProjects = lazy(() => import("./pages/Engineer/EngineerProjects"))
const EngineerProjectBlueprint = lazy(() => import("./pages/Engineer/EngineerProjectBlueprint"))
const EngineerBlueprintAnnotation = lazy(() => import("./pages/Engineer/EngineerBlueprintAnnotation"))
const EngineerProgressVerification = lazy(() => import("./pages/Engineer/EngineerProgressVerification"))
const EngineerReportIssue = lazy(() => import("./pages/Engineer/EngineerReportIssue"))
const EngineerProgress = lazy(() => import("./pages/Engineer/EngineerProgress"))
const EngineerAssignments = lazy(() => import("./pages/Engineer/EngineerAssignments"))
const EngineerReports = lazy(() => import("./pages/Engineer/EngineerReports"))
const EngineerQa = lazy(() => import("./pages/Engineer/EngineerQa"))
const EngineerChecklists = lazy(() => import("./pages/Engineer/EngineerChecklists"))
import type { EngineerPageKey } from "./pages/Engineer/types"
import ForemanShell from "./pages/Foreman/ForemanShell"
const ForemanProjects = lazy(() => import("./pages/Foreman/ForemanProjects"))
const ForemanDashboard = lazy(() => import("./pages/Foreman/ForemanDashboard"))
const ForemanBiometricAttendance = lazy(() => import("./pages/Foreman/ForemanBiometricAttendance"))
const ForemanDailyWorkManagement = lazy(() => import("./pages/Foreman/ForemanDailyWorkManagement"))
const ForemanDailyProgressReport = lazy(() => import("./pages/Foreman/ForemanDailyProgressReport"))
const ForemanPhotoDocumentation = lazy(() => import("./pages/Foreman/ForemanPhotoDocumentation"))
const ForemanQualityControl = lazy(() => import("./pages/Foreman/ForemanQualityControl"))
const ForemanQAWorkflow = lazy(() => import("./pages/Foreman/ForemanQAWorkflow"))
const ForemanIssueTracking = lazy(() => import("./pages/Foreman/ForemanIssueTracking"))
import type { ForemanPageKey } from "./pages/Foreman/types"
import UserShell from "./pages/User/UserShell"
const UserHome = lazy(() => import("./pages/User/UserHome"))
import type { UserPageKey } from "./pages/User/types"
import ClientShell from "./pages/Client/ClientShell"
const ClientOverview = lazy(() => import("./pages/Client/ClientOverview"))
const ClientBlueprint = lazy(() => import("./pages/Client/ClientBlueprint"))
const ClientTicketSubmission = lazy(() => import("./pages/Client/ClientSnagSubmission"))
const ClientSiteLogs = lazy(() => import("./pages/Client/ClientSiteLogs"))
const ClientCommunication = lazy(() => import("./pages/Client/ClientCommunication"))
import type { ClientPageKey } from "./pages/Client/types"

// Page code is loaded on demand. Shells stay mounted while a page loads, so only the content area shows the skeleton.
const withLoading = (node: ReactNode) => (
  <Suspense fallback={<div className="p-6"><SkeletonCardGrid count={3} label="Loading the page" /></div>}>{node}</Suspense>
)

export type Page = "home" | "login" | "register" | "pin-link" | `admin/${AdminPageKey}` | `engineer/${EngineerPageKey}` | `foreman/${ForemanPageKey}` | `client/${ClientPageKey}` | `user/${UserPageKey}`

function pageFromPath(): Page {
  const projectRoute = readProjectRoute(window.location.pathname)
  if (projectRoute) return `admin/${projectRoute.section}`
  if (window.location.pathname.startsWith("/admin/")) {
    const key = window.location.pathname.replace("/admin/", "") as AdminPageKey
    const validKeys: AdminPageKey[] = [
      "dashboard",
      "user-management",
      "biometrics",
      "project-management",
      "blueprint-upload",
      "blueprint-mapping",
      "blueprint-progress",
      "blueprint-version",
      "project-overview",
      "invites",
      "audit-log",
      "settings",
      "access-review",
      "backup",
      "qa-checklists",
    ]
    if (validKeys.includes(key)) return `admin/${key}`
  }
  if (window.location.pathname.startsWith("/engineer/")) {
    const key = window.location.pathname.replace(
      "/engineer/",
      "",
    ) as EngineerPageKey
    const validKeys: EngineerPageKey[] = [
      "dashboard",
      "projects",
      "project-blueprint",
      "annotation",
      "verification",
      "report-issue",
      "progress",
      "assignments",
      "reports",
      "qa",
      "checklists",
    ]
    if (validKeys.includes(key)) return `engineer/${key}`
  }
  if (window.location.pathname.startsWith("/foreman/")) {
    const key = window.location.pathname.replace(
      "/foreman/",
      "",
    ) as ForemanPageKey
    const validKeys: ForemanPageKey[] = [
      "projects",
      "dashboard",
      "attendance",
      "daily-work",
      "daily-report",
      "photo-documentation",
      "quality-control",
      "qa-workflow",
      "issues",
    ]
    // Corrective Action was merged into Corrections (issues): old links and bookmarks still land there.
    if ((key as string) === "corrective-action") {
      window.history.replaceState({}, "", `/foreman/issues${window.location.search}`)
      return "foreman/issues"
    }
    if (validKeys.includes(key)) return `foreman/${key}`
  }
  if (window.location.pathname.startsWith("/client/")) {
    const key = window.location.pathname.replace(
      "/client/",
      "",
    ) as ClientPageKey
    const validKeys: ClientPageKey[] = [
      "overview",
      "blueprint",
      "ticket",
      "site-logs",
      "communication",
    ]
    if (validKeys.includes(key)) return `client/${key}`
  }
  if (window.location.pathname.startsWith("/user/")) {
    const key = window.location.pathname.replace("/user/", "") as UserPageKey
    if (["home"].includes(key)) return `user/${key}`
  }
  if (window.location.pathname === "/pin") return "pin-link"
  if (window.location.pathname === "/login") return "login"
  if (window.location.pathname === "/register") return "register"
  return "home"
}

type AppState = {
  page: Page
}

export default class App extends Component<Record<string, never>, AppState> {
  state: AppState = {
    page: pageFromPath(),
  }

  componentDidMount() {
    window.addEventListener("popstate", this.handlePopState)
  }

  componentWillUnmount() {
    window.removeEventListener("popstate", this.handlePopState)
  }

  handlePopState = () => {
    this.setState({ page: pageFromPath() })
  }

  navigate = (nextPage: Page) => {
    const path = nextPage === "home" ? "/" : nextPage === "pin-link" ? "/pin" : `/${nextPage}`
    window.history.pushState({}, "", path)
    window.scrollTo({ top: 0, behavior: "smooth" })
    this.setState({ page: nextPage })
  }

  navigateAdmin = (nextPage: AdminPageKey, search = "") => {
    const projectId = new URLSearchParams(search).has("list") ? null : new URLSearchParams(search).get("project") ?? getSelectedProjectId()
    const path = nextPage in projectSections && projectId
      ? projectPath(projectId, nextPage as ProjectSection)
      : `/admin/${nextPage}${search}`
    window.history.pushState({}, "", path)
    window.scrollTo({ top: 0, behavior: "smooth" })
    this.setState({ page: `admin/${nextPage}` })
  }

  // Every Engineer / Foreman page except the project list carries the selected project, so each project stays separate.
  navigateEngineer = (nextPage: EngineerPageKey) => {
    const path = fieldPagePath("engineer", nextPage, getSelectedProjectId())
    window.history.pushState({}, "", path)
    window.scrollTo({ top: 0, behavior: "smooth" })
    this.setState({ page: `engineer/${nextPage}` })
  }

  navigateForeman = (nextPage: ForemanPageKey) => {
    const path = fieldPagePath("foreman", nextPage, getSelectedProjectId())
    window.history.pushState({}, "", path)
    window.scrollTo({ top: 0, behavior: "smooth" })
    this.setState({ page: `foreman/${nextPage}` })
  }

  navigateUser = (nextPage: UserPageKey) => {
    const path = `/user/${nextPage}`
    window.history.pushState({}, "", path)
    window.scrollTo({ top: 0, behavior: "smooth" })
    this.setState({ page: `user/${nextPage}` })
  }

  navigateClient = (nextPage: ClientPageKey) => {
    const path = `/client/${nextPage}`
    window.history.pushState({}, "", path)
    window.scrollTo({ top: 0, behavior: "smooth" })
    this.setState({ page: `client/${nextPage}` })
  }

  render() {
    return (
      <RouteGuard page={this.state.page} navigate={this.navigate}>
        <ErrorBoundary resetKey={this.state.page}>
          {this.renderPage()}
        </ErrorBoundary>
        <AppStatus />
      </RouteGuard>
    )
  }

  renderPage() {
    if (this.state.page === "pin-link") return withLoading(<PinLink />)
    if (this.state.page === "login")
      return withLoading(<LoginPage navigate={this.navigate} />)
    if (this.state.page === "register")
      return withLoading(<RegisterPage navigate={this.navigate} />)
    if (this.state.page.startsWith("admin/")) {
      const activePage = this.state.page.replace("admin/", "") as AdminPageKey
      const pageProps = { onNavigate: this.navigateAdmin }
      const page = {
        dashboard: <AdminDashboard {...pageProps} />,
        "user-management": <UserManagement {...pageProps} />,
        biometrics: <BiometricsRegistration {...pageProps} />,
        "project-management": <ProjectManagement {...pageProps} />,
        "blueprint-upload": <BlueprintUpload {...pageProps} />,
        "blueprint-mapping": <BlueprintMapping {...pageProps} />,
        "blueprint-progress": <BlueprintProgressTracking {...pageProps} />,
        "blueprint-version": <BlueprintVersionControl {...pageProps} />,
        "project-overview": <ProjectOverview {...pageProps} />,
        invites: <InviteCodes {...pageProps} />,
        "audit-log": <AuditLog {...pageProps} />,
        settings: <SystemSettings {...pageProps} />,
        "access-review": <AccessReview {...pageProps} />,
        backup: <ProjectBackup {...pageProps} />,
        "qa-checklists": <AdminQaChecklists {...pageProps} />,
      }[activePage]
      return (
        <AdminShell activePage={activePage} onNavigate={this.navigateAdmin}>
          {activePage in projectSections
            ? <ProjectWorkspace key={`${getSelectedProjectId()}:${activePage}`} activePage={activePage as ProjectSection} onNavigate={this.navigateAdmin}>{withLoading(page)}</ProjectWorkspace>
            : withLoading(page)}
        </AdminShell>
      )
    }
    if (this.state.page.startsWith("engineer/")) {
      const activePage = this.state.page.replace(
        "engineer/",
        "",
      ) as EngineerPageKey
      const pageProps = { onNavigate: this.navigateEngineer }
      const page = {
        dashboard: <EngineerDashboard {...pageProps} />,
        projects: <EngineerProjects {...pageProps} />,
        "project-blueprint": <EngineerProjectBlueprint {...pageProps} />,
        annotation: <EngineerBlueprintAnnotation {...pageProps} />,
        verification: <EngineerProgressVerification {...pageProps} />,
        "report-issue": <EngineerReportIssue {...pageProps} />,
        progress: <EngineerProgress {...pageProps} />,
        assignments: <EngineerAssignments {...pageProps} />,
        reports: <EngineerReports {...pageProps} />,
        qa: <EngineerQa {...pageProps} />,
        checklists: <EngineerChecklists {...pageProps} />,
      }[activePage]
      return (
        <EngineerShell
          activePage={activePage}
          onNavigate={this.navigateEngineer}
        >
          {withLoading(page)}
        </EngineerShell>
      )
    }
    if (this.state.page.startsWith("foreman/")) {
      const activePage = this.state.page.replace(
        "foreman/",
        "",
      ) as ForemanPageKey
      const pageProps = { onNavigate: this.navigateForeman }
      const page = {
        projects: <ForemanProjects {...pageProps} />,
        dashboard: <ForemanDashboard {...pageProps} />,
        attendance: <ForemanBiometricAttendance {...pageProps} />,
        "daily-work": <ForemanDailyWorkManagement {...pageProps} />,
        "daily-report": <ForemanDailyProgressReport {...pageProps} />,
        "photo-documentation": <ForemanPhotoDocumentation {...pageProps} />,
        "quality-control": <ForemanQualityControl {...pageProps} />,
        "qa-workflow": <ForemanQAWorkflow {...pageProps} />,
        issues: <ForemanIssueTracking {...pageProps} />,
      }[activePage]
      return (
        <ForemanShell activePage={activePage} onNavigate={this.navigateForeman}>
          {withLoading(page)}
        </ForemanShell>
      )
    }
    if (this.state.page.startsWith("user/")) {
      const activePage = this.state.page.replace("user/", "") as UserPageKey
      return (
        <UserShell activePage={activePage} onNavigate={this.navigateUser}>
          {withLoading(<UserHome />)}
        </UserShell>
      )
    }
    if (this.state.page.startsWith("client/")) {
      const activePage = this.state.page.replace("client/", "") as ClientPageKey
      const pageProps = { onNavigate: this.navigateClient }
      const page = {
        overview: <ClientOverview {...pageProps} />,
        blueprint: <ClientBlueprint {...pageProps} />,
        ticket: <ClientTicketSubmission {...pageProps} />,
        "site-logs": <ClientSiteLogs {...pageProps} />,
        communication: <ClientCommunication {...pageProps} />,
      }[activePage]
      return (
        <ClientShell activePage={activePage} onNavigate={this.navigateClient}>
          {withLoading(page)}
        </ClientShell>
      )
    }
    return withLoading(<LandingPage navigate={this.navigate} />)
  }
}
