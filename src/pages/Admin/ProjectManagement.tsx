import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { AdminButton, PageIntro } from "./AdminShell"
import type { AdminPageProps } from "./types"
import Modal from "../../components/Modal"
import ProjectCard, { type CardPerson } from "../../components/ProjectCard"
import type { Profile } from "../../lib/auth"
import {
  disciplineLabels,
  phaseLabels,
  statusLabels,
  type Discipline,
  openProject,
  useProjects,
  type Project,
  type ProjectMember,
  type ProjectPhase,
  type ProjectStatus,
} from "../../lib/projects"
import { supabase } from "../../lib/supabase"
import { SkeletonCardGrid } from "../../components/ui/Skeleton"
import { useConfirm } from "../../lib/confirm"
import { useToast } from "../../lib/toast"
import { captureStamp } from "../../lib/photoStamp"

type Form = {
  id?: string
  code: string
  name: string
  location: string
  client_name: string
  description: string
  phase: ProjectPhase
  status: ProjectStatus
  start_date: string
  end_date: string
  manager_name: string
  lead_engineer_id: string
  lead_foreman_id: string
  disciplines: Discipline[]
  site_lat: string
  site_lng: string
  site_radius_m: string
}
type FieldErrors = Partial<Record<keyof Form, string>>

const emptyForm: Form = {
  code: "",
  name: "",
  location: "",
  client_name: "",
  description: "",
  phase: "plan_review",
  status: "planning",
  start_date: "",
  end_date: "",
  manager_name: "",
  lead_engineer_id: "",
  lead_foreman_id: "",
  disciplines: [],
  site_lat: "",
  site_lng: "",
  site_radius_m: "150",
}

const field = "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg"
const roleLabel: Record<ProjectMember["member_role"], string> = { engineer: "Engineer", foreman: "Foreman", client: "Client" }

const displayName = (person: Profile | undefined) => person?.full_name || person?.email || "Unknown user"

function validate(form: Form): FieldErrors {
  const errors: FieldErrors = {}
  const code = form.code.trim().toUpperCase()
  if (!/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(code)) errors.code = "2-30 characters: letters, numbers, dashes (e.g. VCB-024)."
  const name = form.name.trim()
  if (name.length < 2 || name.length > 120) errors.name = "Enter a name between 2 and 120 characters."
  if (form.location.length > 200) errors.location = "Keep the location under 200 characters."
  if (form.manager_name.length > 120) errors.manager_name = "Keep the name under 120 characters."
  if (form.client_name.length > 120) errors.client_name = "Keep the client name under 120 characters."
  if (form.start_date && form.end_date && form.end_date < form.start_date) errors.end_date = "End date must be on or after the start date."
  const lat = form.site_lat.trim()
  const lng = form.site_lng.trim()
  if (lat || lng) {
    if (!lat || !lng || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) errors.site_lat = "Enter both the latitude and the longitude as numbers, or leave both empty."
    else if (Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) errors.site_lat = "Latitude is between -90 and 90 and longitude between -180 and 180."
  }
  const radius = Number(form.site_radius_m)
  if (!Number.isInteger(radius) || radius < 20 || radius > 5000) errors.site_radius_m = "Use a whole number of metres from 20 to 5,000."
  return errors
}

function dbMessage(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "That project code is already used. Choose another."
  if (error.code === "42501") return "You do not have permission to do that. Ask a Super Admin for the Projects permission."
  if (error.code === "23514") return "One of the values is not allowed."
  if (/in charge must be/i.test(error.message)) return error.message.replace(/^.*?(The (engineer|foreman) in charge[^"]*).*$/i, "$1")
  if (/fetch|network/i.test(error.message)) return "Network problem. Check your connection and try again."
  return error.message
}

export default function ProjectManagement(_props: AdminPageProps) {
  const { projects, loading, error, reload } = useProjects()
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [people, setPeople] = useState<Profile[]>([])
  const [peopleError, setPeopleError] = useState("")
  const [form, setForm] = useState<Form | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState("")
  const [shareId, setShareId] = useState<string | null>(null)
  const [shareError, setShareError] = useState("")
  const [shareQuery, setShareQuery] = useState("")
  const toast = useToast()
  const confirm = useConfirm()
  // All success / failure messages go through toasts now.
  const setMessage = (m: { text: string; ok: boolean } | null) => {
    if (m) (m.ok ? toast.success(m.text) : toast.error(m.text))
  }
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">("all")
  const [sort, setSort] = useState<"newest" | "name" | "status">("newest")

  const loadPeople = useCallback(async () => {
    const [memberResult, profileResult] = await Promise.all([
      supabase.from("project_members").select("project_id, user_id, member_role"),
      supabase.from("profiles").select("*").in("role", ["engineer", "foreman", "client"]).eq("status", "active"),
    ])
    if (memberResult.error || profileResult.error) {
      setPeopleError("Could not load the team list. Check your connection and retry.")
      return
    }
    setPeopleError("")
    setMembers((memberResult.data as ProjectMember[] | null) ?? [])
    setPeople((profileResult.data as Profile[] | null) ?? [])
  }, [])

  useEffect(() => {
    void loadPeople()
  }, [loadPeople])

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people])
  const cardPeople = (projectId: string): CardPerson[] =>
    members
      .filter((member) => member.project_id === projectId)
      .map((member) => ({ id: member.user_id, name: displayName(peopleById.get(member.user_id)) }))

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase()
    const list = projects.filter(
      (project) =>
        (statusFilter === "all" || project.status === statusFilter) &&
        (!text || `${project.code} ${project.name} ${project.location ?? ""} ${project.client_name ?? ""}`.toLowerCase().includes(text)),
    )
    if (sort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name))
    if (sort === "status") return [...list].sort((a, b) => a.status.localeCompare(b.status))
    return list
  }, [projects, query, statusFilter, sort])

  const openForm = (project?: Project) => {
    setErrors({})
    setFormError("")
    setForm(
      project
        ? {
            id: project.id,
            code: project.code,
            name: project.name,
            location: project.location ?? "",
            client_name: project.client_name ?? "",
            description: project.description ?? "",
            phase: project.phase,
            status: project.status,
            start_date: project.start_date ?? "",
            end_date: project.end_date ?? "",
            manager_name: project.manager_name ?? "",
            lead_engineer_id: project.lead_engineer_id ?? "",
            lead_foreman_id: project.lead_foreman_id ?? "",
            disciplines: project.disciplines ?? [],
            site_lat: project.site_lat === null || project.site_lat === undefined ? "" : String(project.site_lat),
            site_lng: project.site_lng === null || project.site_lng === undefined ? "" : String(project.site_lng),
            site_radius_m: String(project.site_radius_m ?? 150),
          }
        : emptyForm,
    )
  }

  const saveProject = async (event: FormEvent) => {
    event.preventDefault()
    if (!form) return
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length) return
    // Closing, pausing or cancelling a project changes what everyone assigned to it sees: ask first.
    const before = form.id ? projects.find((project) => project.id === form.id)?.status : undefined
    if (before && before !== form.status && (form.status === "completed" || form.status === "cancelled" || form.status === "on_hold")) {
      const verb = form.status === "completed" ? "Mark as completed" : form.status === "cancelled" ? "Cancel this project" : "Put this project on hold"
      if (!(await confirm({ title: `${verb}?`, message: `${form.code.trim().toUpperCase()} changes from ${statusLabels[before]} to ${statusLabels[form.status]} for everyone assigned to it. You can change it back later.`, confirmLabel: verb, tone: form.status === "cancelled" ? "danger" : undefined }))) return
    }
    setBusy(true)
    setFormError("")
    const row = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      location: form.location.trim() || null,
      client_name: form.client_name.trim() || null,
      description: form.description.trim() || null,
      phase: form.phase,
      status: form.status,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      manager_name: form.manager_name.trim() || null,
      lead_engineer_id: form.lead_engineer_id || null,
      lead_foreman_id: form.lead_foreman_id || null,
      disciplines: form.disciplines,
      site_lat: form.site_lat.trim() ? Number(form.site_lat) : null,
      site_lng: form.site_lng.trim() ? Number(form.site_lng) : null,
      site_radius_m: Number(form.site_radius_m),
    }
    const { data, error: saveError } = form.id
      ? await supabase.from("projects").update(row).eq("id", form.id).select("id")
      : await supabase.from("projects").insert(row).select("id")
    setBusy(false)
    if (saveError) return setFormError(dbMessage(saveError))
    if (!data?.length) return setFormError("Nothing was saved. You may not have permission to manage projects.")
    setMessage({ text: form.id ? "Project updated." : "Project created. Use Manage access to add the rest of its team.", ok: true })
    setForm(null)
    await Promise.all([reload(), loadPeople()]) // the engineer / foreman in charge are added to the team automatically
  }

  const removeProject = async (project: Project) => {
    if (!(await confirm({ title: `Delete ${project.code}?`, message: `${project.name} and its plans, pins and team assignments are removed for everyone. This cannot be undone.`, confirmLabel: "Delete project", tone: "danger" }))) return
    const { data, error: deleteError } = await supabase.from("projects").delete().eq("id", project.id).select("id")
    if (deleteError) return setMessage({ text: dbMessage(deleteError), ok: false })
    if (!data?.length) return setMessage({ text: "Nothing was deleted. You may not have permission.", ok: false })
    setMessage({ text: "Project deleted.", ok: true })
    await Promise.all([reload(), loadPeople()])
  }

  // Manage access works like Drive sharing: every add / remove is saved immediately.
  const shareProject = projects.find((project) => project.id === shareId) ?? null
  const shareMembers = members.filter((member) => member.project_id === shareId)
  const suggestions = people
    .filter((person) => !shareMembers.some((member) => member.user_id === person.id))
    .filter((person) => `${person.full_name ?? ""} ${person.email}`.toLowerCase().includes(shareQuery.trim().toLowerCase()))
    .slice(0, 6)

  const addAccess = async (person: Profile) => {
    if (!shareId) return
    setBusy(true)
    setShareError("")
    const { error: addError } = await supabase.from("project_members").insert({ project_id: shareId, user_id: person.id })
    setBusy(false)
    if (addError) return setShareError(dbMessage(addError))
    setShareQuery("")
    await Promise.all([loadPeople(), reload()])
  }

  const removeAccess = async (userId: string) => {
    if (!shareId) return
    const person = people.find((p) => p.id === userId)
    if (!(await confirm({ title: `Remove ${person?.full_name || person?.email || "this person"} from the project?`, message: "They lose access to this project's plans and pins straight away.", confirmLabel: "Remove access", tone: "danger" }))) return
    setBusy(true)
    setShareError("")
    const { error: removeError } = await supabase.from("project_members").delete().eq("project_id", shareId).eq("user_id", userId)
    setBusy(false)
    if (removeError) return setShareError(dbMessage(removeError))
    await Promise.all([loadPeople(), reload()]) // removing a lead from the team also clears them as lead
  }

  // Fills the site coordinates from the phone or laptop the admin is using, standing on the site.
  const fillFromHere = async () => {
    if (!form) return
    const here = await captureStamp(10_000)
    if (here.lat === undefined || here.lng === undefined) return toast.error("Could not read your location", "Allow location access for this site, or type the coordinates.")
    setForm({ ...form, site_lat: here.lat.toFixed(6), site_lng: here.lng.toFixed(6) })
    toast.success("Location filled in", `Accuracy about ${Math.round(here.accuracy_m ?? 0)} m. Save the project to keep it.`)
  }

  const errorText = (key: keyof Form) => (errors[key] ? <span className="mt-1 block text-xs font-normal text-danger-fg">{errors[key]}</span> : null)

  return (
    <div className="admin-page">
      <PageIntro
        eyebrow="Projects • Admin"
        title="Project Management"
        description="Create projects and choose who can see them. Engineers, Foremen and Clients only ever see the projects they are added to."
        action={
          <AdminButton icon="plus" onClick={() => openForm()}>
            New project
          </AdminButton>
        }
      />

      {error || peopleError ? (
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-fg">
          {error || peopleError}
          <button className="font-bold underline" onClick={() => { void reload(); void loadPeople() }}>Retry</button>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by code, name, location or client..."
          aria-label="Search projects"
          className="min-w-[240px] flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg"
        />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ProjectStatus | "all")} aria-label="Filter by status" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg">
          <option value="all">All statuses</option>
          {(Object.keys(statusLabels) as ProjectStatus[]).map((key) => (
            <option key={key} value={key}>{statusLabels[key]}</option>
          ))}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort projects" className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg">
          <option value="newest">Newest first</option>
          <option value="name">Name A-Z</option>
          <option value="status">Status</option>
        </select>
        <span className="text-sm text-fg-muted">{visible.length} of {projects.length}</span>
      </div>

      {loading ? <SkeletonCardGrid count={6} /> : null}
      {!loading && !error && projects.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-10 text-center">
          <p className="mb-3 text-fg-muted">No projects yet. Create the first one to start assigning your team.</p>
          <AdminButton icon="plus" onClick={() => openForm()}>New project</AdminButton>
        </div>
      ) : null}
      {!loading && projects.length > 0 && visible.length === 0 ? <p className="text-sm text-fg-muted">No projects match your filters.</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            people={cardPeople(project.id)}
            onOpen={() => openProject("admin", project.id)}
            actions={
              <>
                <button className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-fg shadow-sm hover:border-brand/50 hover:text-brand-text" onClick={() => openForm(project)}>
                  Edit
                </button>
                <button className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-fg shadow-sm hover:border-brand/50 hover:text-brand-text" onClick={() => { setShareError(""); setShareQuery(""); setShareId(project.id) }}>
                  Manage access
                </button>
                <button className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-danger-fg hover:bg-danger-soft" onClick={() => void removeProject(project)} aria-label={`Delete ${project.code}`}>
                  Delete
                </button>
              </>
            }
          />
        ))}
      </div>

      {form ? (
        <Modal title={form.id ? "Edit project" : "New project"} onClose={() => setForm(null)}>
          <form className="space-y-3" noValidate onSubmit={(event) => void saveProject(event)}>
            {formError ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-fg">{formError}</p> : null}
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold">
                Code *
                <input className={field} maxLength={30} placeholder="VCB-024" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
                {errorText("code")}
              </label>
              <label className="block text-sm font-semibold">
                Client
                <input className={field} placeholder="William Brothers Manila" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
                {errorText("client_name")}
              </label>
            </div>
            <label className="block text-sm font-semibold">
              Project name *
              <input className={field} maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {errorText("name")}
            </label>
            <label className="block text-sm font-semibold">
              Location
              <input className={field} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              {errorText("location")}
            </label>
            <fieldset className="space-y-3 rounded-xl border border-line p-3">
              <legend className="px-1 text-xs font-bold uppercase tracking-wider text-brand-text">Who takes care of this project</legend>
              <label className="block text-sm font-semibold">
                Person in charge (any name)
                <input className={field} maxLength={120} placeholder="e.g. Mr. Roxan Valencia (no login needed)" value={form.manager_name} onChange={(e) => setForm({ ...form, manager_name: e.target.value })} />
                {errorText("manager_name")}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-semibold">
                  Engineer in charge
                  <select className={field} value={form.lead_engineer_id} onChange={(e) => setForm({ ...form, lead_engineer_id: e.target.value })}>
                    <option value="">Not assigned</option>
                    {people.filter((person) => person.role === "engineer").map((person) => (
                      <option key={person.id} value={person.id}>{displayName(person)}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Foreman in charge
                  <select className={field} value={form.lead_foreman_id} onChange={(e) => setForm({ ...form, lead_foreman_id: e.target.value })}>
                    <option value="">Not assigned</option>
                    {people.filter((person) => person.role === "foreman").map((person) => (
                      <option key={person.id} value={person.id}>{displayName(person)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-xs text-fg-muted">The engineer and foreman you pick are added to the project team automatically.</p>
            </fieldset>
            <fieldset className="rounded-xl border border-line p-3">
              <legend className="px-1 text-xs font-bold uppercase tracking-wider text-brand-text">Scope of work</legend>
              <div className="flex flex-wrap gap-4">
                {(Object.keys(disciplineLabels) as Discipline[]).map((discipline) => (
                  <label key={discipline} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.disciplines.includes(discipline)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          disciplines: e.target.checked
                            ? [...form.disciplines, discipline]
                            : form.disciplines.filter((d) => d !== discipline),
                        })
                      }
                    />
                    {disciplineLabels[discipline]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block text-sm font-semibold">
              Description
              <textarea className={field} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-semibold">
                Phase
                <select className={field} value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value as ProjectPhase })}>
                  {(Object.keys(phaseLabels) as ProjectPhase[]).map((phase) => (
                    <option key={phase} value={phase}>{phaseLabels[phase]}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Status
                <select className={field} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
                  {(Object.keys(statusLabels) as ProjectStatus[]).map((status) => (
                    <option key={status} value={status}>{statusLabels[status]}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Start date
                <input className={field} type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </label>
              <label className="block text-sm font-semibold">
                End date
                <input className={field} type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                {errorText("end_date")}
              </label>
            </div>
            <fieldset className="rounded-xl border border-line p-3">
              <legend className="px-1 text-sm font-bold">Site location <span className="font-normal text-fg-muted">(optional)</span></legend>
              <p className="text-xs text-fg-muted">When set, every photo added on site is checked against it: the phone's position must be within the radius. Photos are never blocked; they are marked "At the site" or "Away from site". Stand on the site and press the button, or type the coordinates.</p>
              <div className="mt-2 grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-semibold">Latitude<input className={field} inputMode="decimal" value={form.site_lat} onChange={(e) => setForm({ ...form, site_lat: e.target.value })} placeholder="14.676000" /></label>
                <label className="block text-sm font-semibold">Longitude<input className={field} inputMode="decimal" value={form.site_lng} onChange={(e) => setForm({ ...form, site_lng: e.target.value })} placeholder="120.983000" /></label>
                <label className="block text-sm font-semibold">Radius (metres)<input className={field} inputMode="numeric" value={form.site_radius_m} onChange={(e) => setForm({ ...form, site_radius_m: e.target.value })} /></label>
              </div>
              {errorText("site_lat")}
              {errorText("site_radius_m")}
              <button type="button" className="mt-2 text-sm font-bold text-brand-text hover:underline" onClick={() => void fillFromHere()}>Use my current location</button>
            </fieldset>
            <div className="flex items-center justify-between pt-2">
              {form.id ? (
                <button type="button" className="text-sm font-semibold text-brand-text hover:underline" onClick={() => { setShareError(""); setShareQuery(""); setShareId(form.id!); setForm(null) }}>
                  Manage access
                </button>
              ) : <span />}
              <AdminButton type="submit">{busy ? "Saving..." : form.id ? "Save changes" : "Create project"}</AdminButton>
            </div>
          </form>
        </Modal>
      ) : null}

      {shareProject ? (
        <Modal title={`Manage access: ${shareProject.code}`} onClose={() => setShareId(null)}>
          <div className="space-y-4">
            <p className="text-sm text-fg-muted">{shareProject.name}</p>
            {shareError ? <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-fg">{shareError}</p> : null}
            <div>
              <input
                value={shareQuery}
                onChange={(event) => setShareQuery(event.target.value)}
                placeholder="Add engineers, foremen or clients by name or email"
                aria-label="Add people"
                className={field}
              />
              {shareQuery.trim() || suggestions.length ? (
                <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-line">
                  {suggestions.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-fg-muted">No active people to add.</li>
                  ) : (
                    suggestions.map((person) => (
                      <li key={person.id}>
                        <button type="button" disabled={busy} onClick={() => void addAccess(person)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-muted disabled:opacity-60">
                          <span>
                            <strong className="text-fg">{displayName(person)}</strong>
                            <span className="block text-xs text-fg-muted">{person.email}</span>
                          </span>
                          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-text">{person.role ? roleLabel[person.role as ProjectMember["member_role"]] : ""}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </div>
            <div>
              <h3 className="mb-1 text-sm font-bold text-brand-text">People with access ({shareMembers.length})</h3>
              {shareMembers.length === 0 ? (
                <p className="text-sm text-fg-muted">Nobody yet. Only administrators can see this project.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {shareMembers.map((member) => {
                    const person = peopleById.get(member.user_id)
                    return (
                      <li key={member.user_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span>
                          <strong className="text-fg">{displayName(person)}</strong>
                          <span className="block text-xs text-fg-muted">{person?.email}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-text">{roleLabel[member.member_role]}</span>
                          <button type="button" disabled={busy} onClick={() => void removeAccess(member.user_id)} className="rounded px-2 py-0.5 text-xs font-semibold text-danger-fg hover:bg-danger-soft disabled:opacity-60" aria-label={`Remove ${displayName(person)}`}>
                            Remove
                          </button>
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
            <div className="text-right">
              <AdminButton onClick={() => setShareId(null)}>Done</AdminButton>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
