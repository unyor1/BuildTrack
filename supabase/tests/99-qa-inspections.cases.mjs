// Tests for 0025: QA checklists, inspections (IR), scoring, defects (NCR), evidence photos and the summary.
export default async function ({ db, ids, as, asOwner, test, expectOk, expectFail, count }) {
  await asOwner()
  const P1 = (await db.query("insert into public.projects(code,name,status) values('QA-ISOLATED','QA test project','active') returning id")).rows[0].id
  await db.query("insert into public.blueprints(project_id,title) values($1,'QA test plan')",[P1])
  const OTHER = ids.other

  await asOwner()
  await db.query("insert into public.project_members (project_id, user_id) values ($1, $2) on conflict do nothing", [P1, ids.fore1])
  await db.query("insert into public.project_members (project_id, user_id) values ($1, $2) on conflict do nothing", [P1, ids.eng1])
  await db.query("insert into public.project_members (project_id, user_id) values ($1, $2) on conflict do nothing", [P1, ids.client1])
  // earlier test files change the settings; these tests pin them (pass mark 85, weights 5/3/1)
  await db.query("update public.system_settings set value = '85'::jsonb where key = 'qa.acceptance_threshold'")
  await db.query("update public.system_settings set value = '{\"critical\":5,\"major\":3,\"minor\":1}'::jsonb where key = 'qa.weights'")
  const pin = (await db.query("insert into public.pins (project_id, blueprint_id, x, y, title) values ($1, (select id from public.blueprints where project_id = $1 limit 1), 40, 40, 'QA pin') returning id", [P1]).catch(() => ({ rows: [{ id: null }] }))).rows[0].id

  const notes = async (who, kind) => {
    await asOwner()
    return (await db.query("select * from public.notifications where user_id = $1 and kind = $2 and project_id=$3 order by created_at", [ids[who], kind,P1])).rows
  }
  let lib
  await test("The company library ships ten built-in checklists with items; staff read them, clients and outsiders do not", async () => {
    await asOwner()
    const n = await count("select count(*) n from public.qa_templates where project_id is null and is_system")
    if (n < 10) throw new Error("expected the seeded checklists, got " + n)
    lib = (await db.query("select id from public.qa_templates where name like 'Pre-pour%'")).rows[0].id
    if ((await count("select count(*) n from public.qa_template_items where template_id = $1", [lib])) < 10) throw new Error("items missing")
    for (const who of ["eng1", "fore1"]) {
      await as(who)
      if ((await count("select count(*) n from public.qa_templates")) < 10) throw new Error(who + " cannot read the library")
    }
    await as("client1")
    if ((await count("select count(*) n from public.qa_templates")) !== 0) throw new Error("client reads QA checklists")
    await as("eng2") // staff of another project may read the company library only, never a project's own checklists
    if ((await count("select count(*) n from public.qa_templates where project_id is not null")) !== 0) throw new Error("outsider reads a project checklist")
  })

  await test("Nobody writes QA tables directly", async () => {
    await as("eng1", "aal2")
    await expectFail("insert into public.qa_inspections (project_id, number, title, trade) values ($1, 99, 'Sneaky', 'general')", [P1], /permission denied/)
    await expectFail("update public.qa_defects set status = 'closed'", [], /permission denied/)
    await expectFail("delete from public.qa_templates", [], /permission denied/)
    await expectFail("insert into public.qa_counters (project_id, kind) values ($1, 'ir')", [P1], /permission denied/)
  })

  const items = JSON.stringify([
    { text: "Rebar cover as drawn", severity: "critical", kind: "measure", unit: "mm", min_value: 40, max_value: 60, requires_photo: false, hold_point: true },
    { text: "Formwork clean and tight", severity: "major" },
    { text: "Housekeeping around the pour", severity: "minor" },
  ])
  let tpl
  await test("Engineers build project checklists; the company library is Super Admin only; built-ins cannot be edited", async () => {
    await as("fore1")
    await expectFail("select public.save_qa_template(null, $1, 'My list', 'structural', null, '{}', $2::jsonb)", [P1, items], /engineer of the project/)
    await as("eng1", "aal2")
    await expectFail("select public.save_qa_template(null, null, 'Company list', 'structural', null, '{}', $1::jsonb)", [items], /Super Admin/)
    await expectFail("select public.save_qa_template(null, $1, 'My list', 'structural', null, '{}', '[]'::jsonb)", [P1], /between 1 and 60/)
    await expectFail("select public.save_qa_template(null, $1, 'My list', 'structural', null, '{}', $2::jsonb)", [P1, JSON.stringify([{ text: "x" }])], /check/)
    tpl = (await db.query("select public.save_qa_template(null, $1, 'Slab pour check', 'structural', 'Our own', array['NSCP 2015'], $2::jsonb) id", [P1, items])).rows[0].id
    await expectFail("select public.save_qa_template($1, null, 'Renamed', 'structural', null, '{}', $2::jsonb)", [lib, items], /Super Admin|built-in/)
    await as("super", "aal2")
    await expectFail("select public.save_qa_template($1, null, 'Renamed', 'structural', null, '{}', $2::jsonb)", [lib, items], /built-in/)
    const company = (await db.query("select public.save_qa_template(null, null, 'Company slab list', 'structural', null, '{}', $1::jsonb) id", [items])).rows[0].id
    await as("eng1", "aal2")
    await expectOk("select public.duplicate_qa_template($1, $2, null)", [company, P1])
    await expectFail("select public.duplicate_qa_template($1, $2, null)", [company, OTHER], /engineer of the project|not found/)
    await expectOk("select public.archive_qa_template($1, true)", [tpl])
    await expectOk("select public.archive_qa_template($1, false)", [tpl])
    await expectFail("select public.archive_qa_template($1, true)", [company], /Super Admin/)
  })

  await test("A measured item needs a tolerance; a 'check' item cannot carry one", async () => {
    await as("eng1", "aal2")
    await expectFail("select public.save_qa_template(null, $1, 'Bad', 'general', null, '{}', $2::jsonb)", [P1, JSON.stringify([{ text: "Plain check", kind: "check", unit: "mm", min_value: 1 }])], /check/)
    await expectFail("select public.save_qa_template(null, $1, 'Bad', 'general', null, '{}', $2::jsonb)", [P1, JSON.stringify([{ text: "Reversed range", kind: "measure", unit: "mm", min_value: 9, max_value: 1 }])], /check/)
  })

  let ir
  await test("A foreman requests an inspection: numbered per project, items copied, engineers notified, the clients and outsiders blind", async () => {
    await as("client1")
    await expectFail("select public.request_inspection($1, $2, 'Slab B pre-pour')", [P1, tpl], /not allowed/)
    await as("eng2")
    await expectFail("select public.request_inspection($1, $2, 'Slab B pre-pour')", [P1, tpl], /not allowed/)
    await as("fore1")
    await expectFail("select public.request_inspection($1, gen_random_uuid(), 'Slab B pre-pour')", [P1], /not available/)
    ir = (await db.query("select public.request_inspection($1, $2, 'Slab B pre-pour', $3, 'Grid C-4', 'Ready at 1pm') id", [P1, tpl, pin])).rows[0].id
    const row = (await db.query("select * from public.qa_inspections where id = $1", [ir])).rows[0]
    if (row.number !== 1 || row.status !== "requested" || row.requested_by !== ids.fore1 || row.trade !== "structural") throw new Error("bad inspection " + JSON.stringify(row))
    if ((await count("select count(*) n from public.qa_inspection_items where inspection_id = $1", [ir])) !== 3) throw new Error("items not copied")
    const second = (await db.query("select public.request_inspection($1, $2, 'Slab C') id", [P1, tpl])).rows[0].id
    if ((await db.query("select number from public.qa_inspections where id = $1", [second])).rows[0].number !== 2) throw new Error("numbering")
    const n = await notes("eng1", "qa.requested")
    if (n.length < 2 || !n[0].link.startsWith("/engineer/qa?project=")) throw new Error("engineer not told: " + JSON.stringify(n))
    if ((await notes("fore1", "qa.requested")).length) throw new Error("requester notified of own request")
    await as("client1")
    if ((await count("select count(*) n from public.qa_inspections")) !== 0) throw new Error("client reads inspections")
  })

  await test("A project checklist is frozen into the inspection: editing the template later does not change it", async () => {
    await as("eng1", "aal2")
    await db.query("select public.save_qa_template($1, null, 'Slab pour check v2', 'structural', null, '{}', $2::jsonb)", [tpl, JSON.stringify([{ text: "Only one item now", severity: "minor" }])])
    if ((await count("select count(*) n from public.qa_inspection_items where inspection_id = $1", [ir])) !== 3) throw new Error("snapshot changed")
    await db.query("select public.save_qa_template($1, null, 'Slab pour check', 'structural', null, '{}', $2::jsonb)", [tpl, items]) // back to three items for the next tests
  })

  await test("Only an engineer of the project starts it; items cannot be recorded before that or by someone else", async () => {
    const item = async () => (await db.query("select id from public.qa_inspection_items where inspection_id = $1 order by position limit 1", [ir])).rows[0].id
    await as("eng1", "aal2")
    const first = await item()
    await expectFail("select public.save_inspection_item($1, 'pass')", [first], /not in progress/)
    await as("fore1")
    await expectFail("select public.start_inspection($1)", [ir], /not allowed/)
    await as("eng2")
    await expectFail("select public.start_inspection($1)", [ir], /not allowed/)
    await as("eng1", "aal2")
    await expectOk("select public.start_inspection($1)", [ir])
    await expectFail("select public.start_inspection($1)", [ir], /Only a requested/)
    await as("fore1")
    await expectFail("select public.save_inspection_item($1, 'pass')", [first], /Only the inspector/)
  })

  await test("Recording results: measurements decide pass or fail, a failure and an N/A need a reason, completion needs every item", async () => {
    await as("eng1", "aal2")
    const rows = (await db.query("select id, kind from public.qa_inspection_items where inspection_id = $1 order by position", [ir])).rows
    const [measure, check, minor] = rows.map((r) => r.id)
    await expectFail("select public.complete_inspection($1)", [ir], /Every item needs a result/)
    await expectFail("select public.save_inspection_item($1, 'fail')", [check], /Say what is wrong/)
    await expectFail("select public.save_inspection_item($1, 'na')", [minor], /Say why/)
    await expectFail("select public.save_inspection_item($1, 'maybe')", [minor], /pass, fail/)
    await expectFail("select public.save_inspection_item($1, 'pass')", [measure], /measured value/)
    await expectFail("select public.save_inspection_item($1, 'fail', null, 'Cover too thin')", [measure], /measured value/)
    await expectOk("select public.save_inspection_item($1, 'na', null, 'Not in this pour')", [measure])
    const out = (await db.query("select public.save_inspection_item($1, 'pass', 25, 'cover too thin') r", [measure])).rows[0].r
    if (out !== "fail") throw new Error("a measurement below the minimum must fail whatever was ticked, got " + out)
    const ok = (await db.query("select public.save_inspection_item($1, 'fail', 45, 'fine') r", [measure])).rows[0].r
    if (ok !== "pass") throw new Error("a measurement inside the tolerance must pass, got " + ok)
    const hi = (await db.query("select public.save_inspection_item($1, 'pass', 61, 'too thick') r", [measure])).rows[0].r
    if (hi !== "fail") throw new Error("above the maximum must fail")
    await expectOk("select public.save_inspection_item($1, 'pass', 50, null)", [measure])
    const chk = (await db.query("select public.save_inspection_item($1, 'pass', 99, null) r", [check])).rows[0].r
    if (chk !== "pass" || (await db.query("select measured_value from public.qa_inspection_items where id = $1", [check])).rows[0].measured_value !== null) throw new Error("a check item must not keep a measurement")
    await expectOk("select public.save_inspection_item($1, 'fail', null, 'Debris left in the forms')", [minor])
  })

  await test("Photo evidence: staff of the project only, only while in progress, and the required photo blocks completion", async () => {
    await as("eng1", "aal2")
    const required = (await db.query("select id from public.qa_inspection_items where inspection_id = $1 order by position limit 1", [ir])).rows[0].id
    await asOwner()
    await db.query("update public.qa_inspection_items set requires_photo = true where id = $1", [required])
    await as("eng1", "aal2")
    await expectFail("select public.complete_inspection($1)", [ir], /required photo/)
    await as("client1")
    await expectFail("insert into public.qa_photos (project_id, item_id, path) values ($1, $2, $3)", [P1, required, `${P1}/ir/a.jpg`], /row-level security/)
    await as("eng1", "aal2")
    await expectFail("insert into public.qa_photos (project_id, item_id, path) values ($1, $2, $3)", [P1, required, `${OTHER}/ir/a.jpg`], /project folder/)
    await expectOk("insert into public.qa_photos (project_id, item_id, path, caption) values ($1, $2, $3, 'Cover check')", [P1, required, `${P1}/ir/a.jpg`])
    await as("client1")
    if ((await count("select count(*) n from public.qa_photos")) !== 0) throw new Error("client sees evidence")
    await as("fore1")
    if ((await count("select count(*) n from public.qa_photos")) !== 1) throw new Error("foreman cannot see project evidence")
  })

  let result
  await test("Completing scores by severity weight; a critical or hold-point fail makes it 'failed'; failed items become NCRs with due dates", async () => {
    await as("fore1")
    await expectFail("select public.complete_inspection($1)", [ir], /not found|not allowed/)
    await as("eng1", "aal2")
    // measure (critical, pass), check (major, pass), minor (fail): weights 5 + 3 pass, 1 fail => 8/9 = 88.89
    result = (await db.query("select public.complete_inspection($1, 'Debris to be cleared') r", [ir])).rows[0].r
    if (result.result !== "conditional" || Number(result.score) !== 88.89 && Number(result.score) < 88 || result.defects !== 1) throw new Error("bad result " + JSON.stringify(result))
    const row = (await db.query("select * from public.qa_inspections where id = $1", [ir])).rows[0]
    if (row.status !== "conditional" || Number(row.threshold) !== 85 || !row.weights || !row.completed_at) throw new Error("not snapshotted " + JSON.stringify(row))
    const d = (await db.query("select * from public.qa_defects where inspection_id = $1", [ir])).rows[0]
    if (d.number !== 1 || d.severity !== "minor" || d.status !== "open" || d.assigned_to !== ids.fore1 || !d.due_date) throw new Error("bad defect " + JSON.stringify(d))
    const days = Math.round((new Date(d.due_date) - new Date(new Date().toISOString().slice(0, 10))) / 86400000)
    if (days < 13 || days > 15) throw new Error("minor defects are due in 14 days, got " + days)
    await expectFail("select public.complete_inspection($1)", [ir], /in progress/)
    const told = await notes("fore1", "qa.result")
    const defectNote = await notes("fore1", "qa.defect")
    if (!told.length || !defectNote.length) throw new Error("foreman not notified")
  })

  await test("A completed inspection is frozen: no more results, no photo removal", async () => {
    await as("eng1", "aal2")
    const first = (await db.query("select id from public.qa_inspection_items where inspection_id = $1 order by position limit 1", [ir])).rows[0].id
    await expectFail("select public.save_inspection_item($1, 'fail', null, 'changed my mind')", [first], /not in progress/)
    await expectFail("delete from public.qa_photos where item_id = $1", [first], /cannot be removed/)
    await expectFail("insert into public.qa_photos (project_id, item_id, path) values ($1, $2, $3)", [P1, first, `${P1}/ir/b.jpg`], /in progress/)
  })

  await test("A critical failure fails the inspection whatever the score; all-N/A is refused", async () => {
    await as("fore1")
    const a = (await db.query("select public.request_inspection($1, $2, 'Column C1') id", [P1, tpl])).rows[0].id
    await as("eng1", "aal2")
    await db.query("select public.start_inspection($1)", [a])
    const ids2 = (await db.query("select id from public.qa_inspection_items where inspection_id = $1 order by position", [a])).rows.map((r) => r.id)
    await db.query("select public.save_inspection_item($1, 'fail', 20, 'Cover only 20mm')", [ids2[0]])
    await db.query("select public.save_inspection_item($1, 'pass')", [ids2[1]])
    await db.query("select public.save_inspection_item($1, 'pass')", [ids2[2]])
    const r = (await db.query("select public.complete_inspection($1) r", [a])).rows[0].r
    if (r.result !== "failed" || !r.critical_failed || !r.hold_point_failed || r.defects !== 1) throw new Error("expected failed: " + JSON.stringify(r))
    const d = (await db.query("select severity, due_date, number from public.qa_defects where inspection_id = $1", [a])).rows[0]
    if (d.severity !== "critical" || d.number !== 2) throw new Error("critical NCR expected " + JSON.stringify(d))
    const b = (await db.query("select public.request_inspection($1, $2, 'All N/A') id", [P1, tpl])).rows[0].id
    await db.query("select public.start_inspection($1)", [b])
    for (const row of (await db.query("select id from public.qa_inspection_items where inspection_id = $1", [b])).rows) await db.query("select public.save_inspection_item($1, 'na', null, 'Not in scope')", [row.id])
    await expectFail("select public.complete_inspection($1)", [b], /nothing was inspected/)
    await expectFail("select public.cancel_inspection($1, 'x')", [b], /reason/)
    await expectOk("select public.cancel_inspection($1, 'Wrong checklist chosen')", [b])
    await expectFail("select public.cancel_inspection($1, 'Wrong checklist chosen')", [b], /cannot be cancelled/)
    // below the pass mark without any critical or hold-point item failing: major fails => 6/9 = 66.7
    await as("fore1")
    const m = (await db.query("select public.request_inspection($1, $2, 'Below the mark') id", [P1, tpl])).rows[0].id
    await as("eng1", "aal2")
    await db.query("select public.start_inspection($1)", [m])
    const mi = (await db.query("select id from public.qa_inspection_items where inspection_id = $1 order by position", [m])).rows.map((x) => x.id)
    await db.query("select public.save_inspection_item($1, 'pass', 50)", [mi[0]])
    await db.query("select public.save_inspection_item($1, 'fail', null, 'Forms leaking at joints')", [mi[1]])
    await db.query("select public.save_inspection_item($1, 'pass')", [mi[2]])
    const low = (await db.query("select public.complete_inspection($1) r", [m])).rows[0].r
    if (low.result !== "failed" || low.critical_failed || Number(low.score) !== 66.67) throw new Error("below the mark must fail: " + JSON.stringify(low))
    // all passing
    await as("fore1")
    const c = (await db.query("select public.request_inspection($1, $2, 'Clean one') id", [P1, tpl])).rows[0].id
    await as("eng1", "aal2")
    await db.query("select public.start_inspection($1)", [c])
    for (const row of (await db.query("select id, kind from public.qa_inspection_items where inspection_id = $1", [c])).rows) await db.query("select public.save_inspection_item($1, 'pass', $2)", [row.id, row.kind === "measure" ? 50 : null])
    const clean = (await db.query("select public.complete_inspection($1) r", [c])).rows[0].r
    if (clean.result !== "passed" || Number(clean.score) !== 100 || clean.defects !== 0) throw new Error("expected passed " + JSON.stringify(clean))
  })

  await test("Re-inspection copies only the failed items, once, for failed or conditional inspections", async () => {
    await as("eng2")
    await expectFail("select public.request_reinspection($1)", [ir], /not allowed/)
    await as("fore1")
    const re = (await db.query("select public.request_reinspection($1, 'Debris cleared') id", [ir])).rows[0].id
    const row = (await db.query("select * from public.qa_inspections where id = $1", [re])).rows[0]
    if (row.reinspection_of !== ir || row.status !== "requested") throw new Error("bad re-inspection")
    if ((await count("select count(*) n from public.qa_inspection_items where inspection_id = $1", [re])) !== 1) throw new Error("should copy only the failed item")
    await expectFail("select public.request_reinspection($1)", [ir], /already open/)
    const passed = (await db.query("select id from public.qa_inspections where title = 'Clean one'")).rows[0].id
    await expectFail("select public.request_reinspection($1)", [passed], /failed or conditional/)
    await as("client1")
    await expectFail("select public.request_reinspection($1)", [ir], /not allowed/)
  })

  let ncr
  await test("The defect workflow: foreman works it, needs a real corrective action (and a photo when major or critical), engineer closes or sends back", async () => {
    await as("fore1")
    ncr = (await db.query("select id from public.qa_defects where severity = 'minor' limit 1")).rows[0].id
    const crit = (await db.query("select id from public.qa_defects where severity = 'critical' limit 1")).rows[0].id
    await expectFail("select public.update_defect($1, 'for_verification', 'Cleared all debris')", [ncr], /Start the work/)
    await expectFail("select public.update_defect($1, 'closed')", [ncr], /Status must be/)
    await expectOk("select public.update_defect($1, 'in_progress', null, 'Rushed cleanup', 'Add a cleanup crew before each pour', 'Started')", [ncr])
    await expectFail("select public.update_defect($1, 'for_verification', 'short')", [ncr], /at least 10/)
    await expectOk("select public.update_defect($1, 'for_verification', 'Debris removed and forms blown out')", [ncr])
    // critical needs a photo
    await expectOk("select public.update_defect($1, 'in_progress', 'Added cover blocks, re-tied bars')", [crit])
    await expectFail("select public.update_defect($1, 'for_verification', 'Added cover blocks, re-tied bars')", [crit], /photo/)
    await expectOk("insert into public.qa_photos (project_id, defect_id, path) values ($1, $2, $3)", [P1, crit, `${P1}/ncr/c.jpg`])
    await expectOk("select public.update_defect($1, 'for_verification', 'Added cover blocks, re-tied bars')", [crit])
    const verify = await notes("eng1", "qa.defect_verify")
    if (verify.length < 2) throw new Error("engineer not told to verify")
    await as("eng1", "aal2")
    await expectFail("select public.verify_defect($1, true, 'ok')", [ncr], /at least 5/)
    await expectOk("select public.verify_defect($1, false, 'Debris still under the beam')", [ncr])
    const back = (await db.query("select status, fixed_at from public.qa_defects where id = $1", [ncr])).rows[0]
    if (back.status !== "in_progress" || back.fixed_at) throw new Error("not sent back")
    await as("fore1")
    await expectFail("select public.verify_defect($1, true, 'Looks fine to me')", [ncr], /not found|not allowed/)
    await expectOk("select public.update_defect($1, 'for_verification')", [ncr])
    await as("eng1", "aal2")
    await expectOk("select public.verify_defect($1, true, 'Inspected on site, clean')", [ncr])
    const done = (await db.query("select status, closed_by, closing_note from public.qa_defects where id = $1", [ncr])).rows[0]
    if (done.status !== "closed" || done.closed_by !== ids.eng1) throw new Error("not closed")
    await expectFail("select public.verify_defect($1, true, 'Inspected again')", [ncr], /sent for verification/)
    await as("fore1")
    await expectFail("select public.update_defect($1, 'in_progress')", [ncr], /closed/)
    await expectFail("insert into public.qa_photos (project_id, defect_id, path) values ($1, $2, $3)", [P1, ncr, `${P1}/ncr/d.jpg`], /closed/)
    const trail = (await db.query("select kind from public.qa_defect_events where defect_id = $1 order by id", [ncr])).rows.map((r) => r.kind)
    if (trail.join(",") !== "raised,status,status,rejected,status,closed") throw new Error("trail: " + trail.join(","))
    if ((await notes("fore1", "qa.defect_closed")).length !== 1 || (await notes("fore1", "qa.defect_rejected")).length !== 1) throw new Error("foreman not told of the decisions")
  })

  await test("The audit trail of a defect cannot be written or erased by anyone through the API", async () => {
    await as("eng1", "aal2")
    await expectFail("insert into public.qa_defect_events (defect_id, project_id, kind) values (gen_random_uuid(), $1, 'closed')", [P1], /permission denied/)
    await expectFail("delete from public.qa_defect_events", [], /permission denied/)
  })

  await test("Raising a defect by hand: engineers and foremen on the project; assignee must be a project foreman; bad inputs are refused", async () => {
    await as("client1")
    await expectFail("select public.raise_defect($1, 'Crack', 'Wide crack', 'workmanship', 'major', 'structural')", [P1], /not allowed/)
    await as("eng1", "aal2")
    await expectFail("select public.raise_defect($1, 'Crack', 'Wide crack', 'bogus', 'major', 'structural')", [P1], /check/)
    await expectFail("select public.raise_defect($1, 'Crack', 'Wide crack', 'workmanship', 'major', 'structural', null, null, $2)", [P1, ids.client1], /foreman of the project/)
    await expectFail("select public.raise_defect($1, 'Crack', 'Wide crack', 'workmanship', 'major', 'structural', null, null, null, current_date - 10)", [P1], /past/)
    const id = (await db.query("select public.raise_defect($1, 'Crack on wall B', 'Hairline, 2m long', 'workmanship', 'major', 'architectural', 'NSCP 2015', $2, $3, null) id", [P1, pin, ids.fore1])).rows[0].id
    const d = (await db.query("select * from public.qa_defects where id = $1", [id])).rows[0]
    if (d.number !== 4 || d.assigned_to !== ids.fore1) throw new Error("bad defect " + JSON.stringify(d))
    const days = Math.round((new Date(d.due_date) - new Date(new Date().toISOString().slice(0, 10))) / 86400000)
    if (days < 6 || days > 8) throw new Error("major defects are due in 7 days, got " + days)
    await expectOk("select public.edit_defect($1, 'Crack on wall B', 'Hairline, 2m long', 'workmanship', 'critical', 'NSCP 2015', $2, current_date + 2)", [id, ids.fore1])
    await as("fore1")
    await expectFail("select public.edit_defect($1, 'x', 'x', 'workmanship', 'minor', null, null, null)", [id], /not allowed/)
    const mine = await db.query("select public.generate_defect_reminders() n")
    if (mine.rows[0].n < 1) throw new Error("no reminder for a defect due within 2 days")
    const again = await db.query("select public.generate_defect_reminders() n")
    if (again.rows[0].n !== 0) throw new Error("reminders must not repeat the same day")
  })

  await test("Staff of other projects see none of it; clients only reach the summary, with no names", async () => {
    await as("eng2")
    if ((await count("select count(*) n from public.qa_defects")) !== 0 || (await count("select count(*) n from public.qa_inspections")) !== 0) throw new Error("outsider reads QA data")
    await expectFail("select public.get_qa_summary($1)", [P1], /not found/)
    await as("client1")
    if ((await count("select count(*) n from public.qa_defects")) !== 0) throw new Error("client reads defects")
    const s = (await db.query("select public.get_qa_summary($1) s", [P1])).rows[0].s
    if (s.staff !== false || s.inspections.total < 3) throw new Error("summary " + JSON.stringify(s))
  })

  await test("The summary: first-pass rate, open and overdue defects, closure time, per trade", async () => {
    await as("eng1", "aal2")
    const s = (await db.query("select public.get_qa_summary($1) s", [P1])).rows[0].s
    // first-time inspections completed: conditional, failed (critical), failed (below the mark), passed => 1 of 4 passed first time
    if (Number(s.inspections.first_pass_rate) !== 25) throw new Error("first pass " + JSON.stringify(s.inspections))
    if (s.inspections.passed !== 1 || s.inspections.conditional !== 1 || s.inspections.failed !== 2 || s.inspections.requested !== 2) throw new Error("counts " + JSON.stringify(s.inspections))
    if (s.defects.closed !== 1 || s.defects.open < 2 || s.defects.critical_open < 1) throw new Error("defects " + JSON.stringify(s.defects))
    if (!Array.isArray(s.by_trade) || !s.by_trade.length || s.staff !== true) throw new Error("trade breakdown")
    if (Number(s.items.defects_per_100_items) <= 0) throw new Error("rate")
  })

  await test("Disabled people lose access at once", async () => {
    await asOwner()
    await db.query("update public.profiles set status = 'disabled' where id = $1", [ids.fore1])
    await as("fore1")
    if ((await count("select count(*) n from public.qa_inspections")) !== 0) throw new Error("disabled foreman still reads")
    await expectFail("select public.raise_defect($1, 'Crack', 'Wide crack', 'workmanship', 'major', 'structural')", [P1], /not allowed/)
    await asOwner()
    await db.query("update public.profiles set status = 'active' where id = $1", [ids.fore1])
  })
}
