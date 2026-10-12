// Tests for 0027: client defect reports (snags) -> engineer decision -> NCR -> resolved.
export default async function ({ db, ids, as, asOwner, test, expectOk, expectFail, count, addUser }) {
  const P1 = ids.p1
  await asOwner()
  for (const [project, user] of [[P1, ids.fore1], [P1, ids.eng1], [P1, ids.client1]]) await db.query("insert into public.project_members (project_id, user_id) values ($1, $2) on conflict do nothing", [project, user])
  await addUser("client2", "client")
  const notes = async (who, kind) => {
    await asOwner()
    return (await db.query("select * from public.notifications where user_id = $1 and kind = $2 order by created_at", [ids[who], kind])).rows
  }
  let snag
  const path = (id, name = "a.jpg") => `${P1}/${id}/${name}`

  await test("Only an active client of the project can send a report; the engineers are told", async () => {
    await as("fore1")
    await expectFail("select public.submit_snag($1, 'Leaking tap', null, null)", [P1], /Only the client/)
    await as("client2")
    await expectFail("select public.submit_snag($1, 'Leaking tap', null, null)", [P1], /Only the client/)
    await as("client1")
    await expectFail("select public.submit_snag($1, 'x', null, null)", [P1], /check/)
    await expectFail("select public.submit_snag($1, 'Leaking tap', null, null, 'whenever')", [P1], /check/)
    snag = (await db.query("select public.submit_snag($1, 'Crack above door D3', 'Hairline, 1 m long', 'Level 2, room 204', 'urgent') id", [P1])).rows[0].id
    const row = (await db.query("select * from public.client_snags where id = $1", [snag])).rows[0]
    if (row.number !== 1 || row.status !== "submitted" || row.author_id !== ids.client1 || row.urgency !== "urgent") throw new Error("bad row " + JSON.stringify(row))
    const eng = await notes("eng1", "snag.new")
    if (eng.length !== 1 || !eng[0].link.includes("tab=snags")) throw new Error("engineer not told: " + JSON.stringify(eng))
  })

  await test("No direct writes; a client sees only their own reports; staff of the project see all; outsiders see none", async () => {
    await as("client1")
    await expectFail("insert into public.client_snags (project_id, number, title) values ($1, 9, 'Sneaky')", [P1], /permission denied/)
    await expectFail("update public.client_snags set status = 'resolved'", [], /permission denied/)
    await expectFail("delete from public.client_snags", [], /permission denied/)
    if ((await count("select count(*) n from public.client_snags")) !== 1) throw new Error("author cannot read own report")
    for (const who of ["eng1", "fore1"]) {
      await as(who)
      if ((await count("select count(*) n from public.client_snags")) !== 1) throw new Error(who + " cannot read the report")
    }
    for (const who of ["client2", "eng2"]) {
      await as(who)
      if ((await count("select count(*) n from public.client_snags")) !== 0) throw new Error(who + " reads a report")
    }
  })

  await test("Photos: only the author, only while pending, max 4, inside the report's folder", async () => {
    await as("client1")
    await expectFail("insert into public.snag_photos (snag_id, project_id, path) values ($1, $2, $3)", [snag, P1, `${P1}/other/a.jpg`], /own folder/)
    for (let i = 0; i < 4; i++) await expectOk("insert into public.snag_photos (snag_id, project_id, path) values ($1, $2, $3)", [snag, P1, path(snag, `p${i}.jpg`)])
    await expectFail("insert into public.snag_photos (snag_id, project_id, path) values ($1, $2, $3)", [snag, P1, path(snag, "p5.jpg")], /At most 4/)
    await as("client2")
    await expectFail("insert into public.snag_photos (snag_id, project_id, path) values ($1, $2, $3)", [snag, P1, path(snag, "x.jpg")], /own reports/)
    await as("eng1")
    await expectFail("insert into public.snag_photos (snag_id, project_id, path) values ($1, $2, $3)", [snag, P1, path(snag, "y.jpg")], /own reports/)
    if ((await count("select count(*) n from public.snag_photos")) !== 4) throw new Error("engineer cannot see the photos")
    await as("client2")
    if ((await count("select count(*) n from public.snag_photos")) !== 0) throw new Error("outsider sees photos")
  })

  await test("The client can withdraw a pending report; it cannot be withdrawn after a decision", async () => {
    await as("client1")
    const other = (await db.query("select public.submit_snag($1, 'Paint stain on stair', null, null) id", [P1])).rows[0].id
    await as("client2")
    await expectFail("select public.withdraw_snag($1)", [other], /not found/)
    await as("client1")
    await expectOk("select public.withdraw_snag($1)", [other])
    await expectFail("select public.withdraw_snag($1)", [other], /still waiting/)
  })

  await test("Limits: at most 5 waiting reports per project", async () => {
    await as("client1")
    for (let i = 0; i < 4; i++) await db.query("select public.submit_snag($1, $2, null, null)", [P1, `Waiting report ${i}`])
    await expectFail("select public.submit_snag($1, 'One too many', null, null)", [P1], /5 reports waiting/)
    await asOwner()
    await db.query("update public.client_snags set status = 'withdrawn' where title like 'Waiting report%'")
  })

  await test("Only an engineer of the project decides; declining needs a reason the client is told", async () => {
    await as("client1")
    await expectFail("select public.decide_snag($1, true)", [snag], /not allowed/)
    await as("fore1")
    await expectFail("select public.decide_snag($1, true)", [snag], /not allowed/)
    await as("eng2")
    await expectFail("select public.decide_snag($1, true)", [snag], /not allowed/)
    await as("eng1", "aal2")
    const second = (await (async () => { await as("client1"); return (await db.query("select public.submit_snag($1, 'Window will not close', null, 'Level 1') id", [P1])).rows[0].id })())
    await as("eng1", "aal2")
    await expectFail("select public.decide_snag($1, false, 'no')", [second], /at least 5/)
    await expectOk("select public.decide_snag($1, false, 'This is part of the agreed finish, not a defect')", [second])
    const declined = (await db.query("select status, response from public.client_snags where id = $1", [second])).rows[0]
    if (declined.status !== "declined" || !/agreed finish/.test(declined.response)) throw new Error("not declined")
    const told = await notes("client1", "snag.declined")
    if (told.length !== 1 || !told[0].link.startsWith("/client/ticket?project=")) throw new Error("client not told")
    await expectFail("select public.decide_snag($1, true)", [second], /already been decided/)
    await as("client1")
    await expectFail("select public.withdraw_snag($1)", [second], /still waiting/)
  })

  let ncr
  await test("Accepting raises an NCR for the foreman, tells the client, and freezes the photos", async () => {
    await as("eng1", "aal2")
    ncr = (await db.query("select public.decide_snag($1, true, 'Thank you, we will repair it', 'major', 'workmanship', 'architectural', $2, null, 'NSCP 2015') id", [snag, ids.fore1])).rows[0].id
    const d = (await db.query("select * from public.qa_defects where id = $1", [ncr])).rows[0]
    if (!d || d.status !== "open" || d.severity !== "major" || d.assigned_to !== ids.fore1 || !/Reported by the client/.test(d.description) || !/Level 2, room 204/.test(d.description)) throw new Error("bad NCR " + JSON.stringify(d))
    const row = (await db.query("select * from public.client_snags where id = $1", [snag])).rows[0]
    if (row.status !== "accepted" || row.defect_id !== ncr || row.fix_stage !== "open" || row.decided_by !== ids.eng1) throw new Error("bad snag " + JSON.stringify(row))
    if ((await notes("client1", "snag.accepted")).length !== 1) throw new Error("client not told")
    await as("client1")
    await expectFail("delete from public.snag_photos", [], /cannot be removed/)
    await expectFail("insert into public.snag_photos (snag_id, project_id, path) values ($1, $2, $3)", [snag, P1, path(snag, "late.jpg")], /waiting for the engineer/)
    if ((await count("select count(*) n from public.qa_defects")) !== 0) throw new Error("client can read NCRs")
  })

  await test("The client's report follows the NCR and is resolved when the engineer closes it", async () => {
    await as("fore1")
    await expectOk("select public.update_defect($1, 'in_progress', 'Cut out and re-plastered the crack')", [ncr])
    await as("client1")
    if ((await db.query("select fix_stage from public.client_snags where id = $1", [snag])).rows[0].fix_stage !== "in_progress") throw new Error("stage not followed")
    await as("fore1")
    await asOwner()
    await db.query("insert into public.qa_photos (project_id, defect_id, path) values ($1, $2, $3)", [P1, ncr, `${P1}/ncr/fix.jpg`])
    await as("fore1")
    await expectOk("select public.update_defect($1, 'for_verification', 'Cut out and re-plastered the crack')", [ncr])
    await as("eng1", "aal2")
    await expectOk("select public.verify_defect($1, true, 'Checked on site, repair is sound')", [ncr])
    await as("client1")
    const row = (await db.query("select status, fix_stage, resolved_at from public.client_snags where id = $1", [snag])).rows[0]
    if (row.status !== "resolved" || row.fix_stage !== "closed" || !row.resolved_at) throw new Error("not resolved " + JSON.stringify(row))
    if ((await notes("client1", "snag.resolved")).length !== 1) throw new Error("client not told it was fixed")
  })

  await test("Disabled clients lose access at once", async () => {
    await asOwner()
    await db.query("update public.profiles set status = 'disabled' where id = $1", [ids.client1])
    await as("client1")
    if ((await count("select count(*) n from public.client_snags")) !== 0) throw new Error("disabled client still reads")
    await expectFail("select public.submit_snag($1, 'Anything', null, null)", [P1], /Only the client/)
    await asOwner()
    await db.query("update public.profiles set status = 'active' where id = $1", [ids.client1])
  })
}
