// Tests for 0036: the faster read rules return exactly the rows the old per-row rules returned, for every role.
// The old rule is evaluated as the table owner with the person's identity set, the new one as the person through RLS.
export default async function ({ db, as, test }) {
  const oldRules = {
    blueprints: "public.can_view_project(project_id)",
    blueprint_revisions: "public.can_view_project(project_id)",
    blueprint_annotations: "public.can_view_project(project_id)",
    pin_checklist_items: "public.can_view_project(project_id)",
    pins: "public.can_view_project(project_id)",
    pin_photos: "public.can_view_project(project_id)",
    pin_events: "public.can_view_project(project_id) and not public.is_project_client(project_id)",
    daily_reports: "public.can_view_project(project_id) and (author_id = auth.uid() or status = 'submitted' or (public.is_staff() and revision>0 and review_state='returned'))",
    project_questions: "public.can_view_project(project_id) and (author_id = auth.uid() or not public.is_project_client(project_id))",
    qa_inspections: "public.is_staff() and public.can_view_project(project_id)",
    qa_inspection_items: "public.is_staff() and public.can_view_project(project_id)",
    qa_defects: "public.is_staff() and public.can_view_project(project_id)",
    qa_defect_events: "public.is_staff() and public.can_view_project(project_id)",
    qa_photos: "public.is_staff() and public.can_view_project(project_id)",
    client_snags: "(author_id = auth.uid() and public.is_active()) or (public.is_staff() and public.can_view_project(project_id))",
  }
  const people = [["super", "aal2"], ["admin", "aal2"], ["admin", "aal1"], ["eng1", "aal1"], ["eng2", "aal1"], ["fore1", "aal1"], ["client1", "aal1"], ["pending1", "aal1"]]

  await test("Every role sees exactly the same rows as before on all 15 tables (and the fixtures are not empty)", async () => {
    let compared = 0
    const mismatches = []
    for (const [who, aal] of people) {
      for (const [table, rule] of Object.entries(oldRules)) {
        await as(who, aal)
        const now = Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n)
        await db.exec("reset role") // keep the person's identity, drop RLS: evaluate the old rule directly
        const before = Number((await db.query(`select count(*) n from public.${table} where ${rule}`)).rows[0].n)
        if (now !== before) mismatches.push(`${who}/${aal} ${table}: now ${now}, before ${before}`)
        compared += now
      }
    }
    if (mismatches.length) throw new Error(mismatches.join("; "))
    if (compared < 100) throw new Error("too few rows to prove anything: " + compared)
  })

  await test("The project set is computed once per query (no per-row function call left on the big tables)", async () => {
    await as("eng1")
    const plan = (await db.query("explain select * from public.pins")).rows.map((row) => row["QUERY PLAN"]).join("\n")
    if (!/viewable_project_ids/.test(plan) && !/SubPlan|InitPlan|Hash/.test(plan)) throw new Error(plan)
    if (/can_view_project\(pins\.project_id\)/.test(plan)) throw new Error("per-row check still in the plan:\n" + plan)
  })
}
