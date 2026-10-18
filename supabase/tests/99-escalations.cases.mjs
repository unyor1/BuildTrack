// Tests for 0038: late-work digests for engineers and escalations for admins.
export default async function ({ db, ids, as, asOwner, test, count, addUser }) {
  await addUser("alertfore", "foreman")
  await asOwner()
  // A project of its own, so numbers from other tests never leak in.
  const project = (await db.query("insert into public.projects (code, name, status) values ('ALERT-1', 'Alert test tower', 'active') returning id")).rows[0].id
  const other = (await db.query("insert into public.projects (code, name, status) values ('ALERT-2', 'Quiet tower', 'active') returning id")).rows[0].id
  await db.query("insert into public.project_members (project_id, user_id) values ($1, $2), ($1, $3), ($4, $3)", [project, ids.eng1, ids.alertfore, other])
  const sheet = (await db.query("insert into public.blueprints (project_id, title) values ($1, 'Alert plan') returning id", [project])).rows[0].id
  const pin = (title, extra = "") => db.query(`insert into public.pins (project_id, blueprint_id, x, y, title, due_date ${extra ? ", " + extra.split("=")[0] : ""}) values ($1, $2, 1, 1, $3, current_date - 5 ${extra ? ", " + extra.split("=")[1] : ""})`, [project, sheet, title])
  await pin("Late 5 days")
  await pin("Verified long ago")
  await db.query("select set_config('request.jwt.claims', '', false)") // trusted historical fixture, not an authenticated verification
  await db.query("update public.pins set status = 'verified' where project_id = $1 and title = 'Verified long ago'", [project]) // a new pin cannot start verified (0040)
  await db.query("insert into public.pins (project_id, blueprint_id, x, y, title, category, due_date) values ($1, $2, 2, 2, 'A note', 'note', current_date - 30)", [project, sheet])
  await db.query("insert into public.pins (project_id, blueprint_id, x, y, title, due_date) values ($1, $2, 3, 3, 'Only 1 day late', current_date - 1)", [project, sheet])
  const notes = async (who, kind) => {
    await asOwner()
    return count("select count(*) n from public.notifications where user_id = $1 and kind = $2 and project_id = $3", [ids[who], kind, project])
  }

  await test("An engineer of the project gets one digest a day: work 3+ days late counts, verified work, notes and recent lateness do not", async () => {
    await as("eng1")
    const first = Number((await db.query("select public.generate_escalations() n")).rows[0].n)
    if (first < 1) throw new Error("expected at least the digest for the late project, got " + first) // other test projects with late work may add theirs
    if ((await notes("eng1", "alert.overdue")) !== 1) throw new Error("exactly one digest for this project")
    await asOwner()
    const row = (await db.query("select title, body, link from public.notifications where user_id = $1 and kind = 'alert.overdue' and project_id = $2", [ids.eng1, project])).rows[0]
    if (!/ALERT-1: work is running late/.test(row.title)) throw new Error(row.title)
    if (!/^1 work item is 3 or more days late\.$/.test(row.body)) throw new Error("body: " + row.body)
    if (row.link !== "/engineer/dashboard?project=" + project) throw new Error("link " + row.link)
  })

  await test("The same day again creates nothing new (no flooding)", async () => {
    await as("eng1")
    if (Number((await db.query("select public.generate_escalations() n")).rows[0].n) !== 0) throw new Error("a second digest was created")
    if ((await notes("eng1", "alert.overdue")) !== 1) throw new Error("duplicate notification")
  })

  await test("Overdue defect reports are added to the engineer's digest next day, and a quiet project gets none", async () => {
    await asOwner()
    await db.query("insert into public.qa_defects (project_id, number, title, severity, due_date, status) values ($1, 1, 'Honeycombing on column', 'minor', current_date - 2, 'open'), ($1, 2, 'Closed and late', 'minor', current_date - 9, 'closed')", [project])
    await db.query("delete from public.notifications where user_id = $1 and kind = 'alert.overdue'", [ids.eng1]) // simulate the next day
    await as("eng1")
    await db.query("select public.generate_escalations()")
    await asOwner()
    const body = (await db.query("select body from public.notifications where user_id = $1 and kind = 'alert.overdue' and project_id = $2", [ids.eng1, project])).rows[0].body
    if (!/1 work item is 3 or more days late and 1 defect report is past the deadline\./.test(body)) throw new Error("body: " + body)
    if ((await notes("eng1", "alert.overdue")) !== 1) throw new Error("one digest per project")
    if ((await count("select count(*) n from public.notifications where user_id = $1 and kind = 'alert.overdue' and project_id = $2", [ids.eng1, other])) !== 0) throw new Error("a project the engineer is not on, or a quiet one, got a digest")
  })

  await test("Foremen, clients, pending accounts and engineers of other projects are never alerted", async () => {
    for (const who of ["alertfore", "client1", "pending1", "eng2"]) {
      await as(who)
      if (Number((await db.query("select public.generate_escalations() n")).rows[0].n) !== 0) throw new Error(who + " got an alert")
    }
  })

  await test("Admins are escalated only for serious cases: a critical defect report past its deadline", async () => {
    await as("admin", "aal2")
    const before = Number((await db.query("select public.generate_escalations() n")).rows[0].n)
    await asOwner()
    // 5-day-old late work is below the 7-day bar, and the minor defect is only 2 days late: nothing yet for this project
    if ((await notes("admin", "alert.escalation")) !== 0) throw new Error("escalated too early (before=" + before + ")")
    await db.query("insert into public.qa_defects (project_id, number, title, severity, due_date, status) values ($1, 3, 'Missing guardrail', 'critical', current_date - 1, 'open')", [project])
    await as("admin", "aal2")
    await db.query("select public.generate_escalations()")
    await asOwner()
    const row = (await db.query("select title, body, link from public.notifications where user_id = $1 and kind = 'alert.escalation' and project_id = $2", [ids.admin, project])).rows[0]
    if (!row || !/ALERT-1: needs your attention/.test(row.title) || !/1 critical defect report past the deadline/.test(row.body)) throw new Error(JSON.stringify(row))
    if (row.link !== "/admin/project-overview?project=" + project) throw new Error("link " + row.link)
  })

  await test("An admin without the Projects permission, and the Super Admin's own digest, follow the permission rule", async () => {
    await as("noperm", "aal2")
    if (Number((await db.query("select public.generate_escalations() n")).rows[0].n) !== 0) throw new Error("admin without projects.manage was alerted")
    await as("super", "aal2")
    await db.query("select public.generate_escalations()")
    if ((await notes("super", "alert.escalation")) !== 1) throw new Error("the Super Admin should be escalated too")
  })

  await test("Finished projects are ignored, and anonymous callers cannot use it", async () => {
    await asOwner()
    await db.query("update public.projects set status = 'completed' where id = $1", [project])
    await db.query("delete from public.notifications where kind in ('alert.overdue', 'alert.escalation') and project_id = $1", [project])
    await as("eng1")
    if (Number((await db.query("select public.generate_escalations() n")).rows[0].n) !== 0) throw new Error("a completed project still alerts")
    await as(null)
    try {
      await db.query("select public.generate_escalations()")
      throw new Error("anonymous call worked")
    } catch (error) {
      if (!/permission denied/.test(error.message)) throw error
    }
  })
}
