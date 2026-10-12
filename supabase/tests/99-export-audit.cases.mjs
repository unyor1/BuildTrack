// Tests for 0023: project backups are written to the audit log.
export default async function ({ db, ids, as, asOwner, test, expectOk, expectFail, count }) {
  await test("Only admins with projects.manage (and MFA) can record a project export; the audit row carries the facts", async () => {
    await as("eng1")
    await expectFail("select public.log_project_export($1, true, 10)", [ids.p1], /projects.manage/)
    await as("noperm", "aal2")
    await expectFail("select public.log_project_export($1, true, 10)", [ids.p1], /projects.manage/)
    await as("admin", "aal1")
    await expectFail("select public.log_project_export($1, true, 10)", [ids.p1], /projects.manage/)
    await as("admin", "aal2")
    await expectFail("select public.log_project_export(gen_random_uuid(), true, 10)", [], /Project not found/)
    await expectOk("select public.log_project_export($1, true, 1234)", [ids.p1])
    await asOwner()
    const row = (await db.query("select actor_id, details from public.audit_log where action = 'project.export' order by id desc limit 1")).rows[0]
    if (row.actor_id !== ids.admin) throw new Error("actor not recorded")
    if (row.details.project_id !== ids.p1 || row.details.with_files !== true || row.details.rows !== 1234) throw new Error("details wrong: " + JSON.stringify(row.details))
    await as("admin", "aal2")
    await expectFail("insert into public.audit_log (action) values ('forged')", [], /permission denied|row-level security/)
  })
}
