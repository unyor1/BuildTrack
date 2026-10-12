// Tests for 0021: foreman daily reports (draft / submitted / reopen) and client questions.
export default async function ({ db, ids, as, asOwner, test, expectOk, expectFail, count }) {
  const P1 = ids.p1
  const today = "(now() at time zone 'Asia/Manila')::date"

  await asOwner()
  await db.query("insert into public.project_members (project_id, user_id) values ($1, $2) on conflict do nothing", [P1, ids.fore1])
  await db.query("insert into public.project_members (project_id, user_id) values ($1, $2) on conflict do nothing", [P1, ids.eng1])
  await db.query("insert into public.project_members (project_id, user_id) values ($1, $2) on conflict do nothing", [P1, ids.client1])
  const notes = async (who, kind) => {
    await as(who, "aal2")
    return (await db.query("select * from public.notifications where kind = $1 order by created_at", [kind])).rows
  }

  // ---------------------------------------------------------------- daily reports
  await test("A foreman writes a draft; defaults and the author are set by the database", async () => {
    await as("fore1")
    await expectFail(`insert into public.daily_reports (project_id, report_date, work_done, author_id) values ($1, ${today}, 'Poured slab B', $2)`, [P1, ids.eng1], /permission denied/)
    const row = (await db.query(`insert into public.daily_reports (project_id, report_date, work_done) values ($1, ${today}, 'Poured slab B') returning *`, [P1])).rows[0]
    if (row.author_id !== ids.fore1) throw new Error("author must be the caller, not what the client sent")
    if (row.status !== "draft" || row.weather !== "sunny" || row.workers_count !== 0) throw new Error("bad defaults: " + JSON.stringify(row))
  })

  await test("One report per author per day; no future dates; at most 14 days back; bounds are enforced", async () => {
    await as("fore1")
    await expectFail(`insert into public.daily_reports (project_id, report_date) values ($1, ${today})`, [P1], /unique|duplicate/)
    await expectFail(`insert into public.daily_reports (project_id, report_date) values ($1, ${today} + 1)`, [P1], /future/)
    await expectFail(`insert into public.daily_reports (project_id, report_date) values ($1, ${today} - 30)`, [P1], /14 days/)
    await expectFail(`insert into public.daily_reports (project_id, report_date, workers_count) values ($1, ${today} - 1, 9999)`, [P1], /check/)
    await expectFail(`insert into public.daily_reports (project_id, report_date, weather) values ($1, ${today} - 1, 'snow')`, [P1], /check/)
  })

  await test("A draft is private to its author", async () => {
    for (const who of ["eng1", "client1"]) {
      await as(who)
      if ((await count("select count(*) n from public.daily_reports")) !== 0) throw new Error(who + " can read someone else's draft")
    }
    await as("fore1")
    if ((await count("select count(*) n from public.daily_reports")) !== 1) throw new Error("author cannot read own draft")
  })

  await test("Clients, other engineers and outsiders cannot write reports", async () => {
    await as("client1")
    await expectFail(`insert into public.daily_reports (project_id, report_date) values ($1, ${today} - 1)`, [P1], /row-level security/)
    await as("eng2")
    await expectFail(`insert into public.daily_reports (project_id, report_date) values ($1, ${today} - 1)`, [P1], /row-level security/)
  })

  await test("Submitting needs a description, stamps the time and notifies the project engineers (not the author)", async () => {
    await as("fore1")
    await db.query("update public.daily_reports set work_done = '   ' where project_id = $1", [P1])
    await expectFail("update public.daily_reports set status = 'submitted' where project_id = $1", [P1], /Describe the work/)
    await db.query("update public.daily_reports set work_done = 'Poured slab B, 12 workers', workers_count = 12, weather = 'cloudy' where project_id = $1", [P1])
    await expectOk("update public.daily_reports set status = 'submitted' where project_id = $1", [P1])
    const row = (await db.query("select * from public.daily_reports where project_id = $1", [P1])).rows[0]
    if (row.status !== "submitted" || !row.submitted_at) throw new Error("not submitted")
    const eng = await notes("eng1", "report.submitted")
    if (eng.length !== 1 || !eng[0].link.startsWith("/engineer/reports?project=")) throw new Error("engineer not notified: " + JSON.stringify(eng))
    if ((await notes("fore1", "report.submitted")).length !== 0) throw new Error("author was notified of own report")
  })

  await test("A submitted report is read-only for its author and visible to the whole project", async () => {
    await as("fore1")
    const edited = await db.query("update public.daily_reports set work_done = 'changed' where project_id = $1 returning id", [P1])
    if (edited.rows.length) throw new Error("author edited a submitted report")
    const removed = await db.query("delete from public.daily_reports where project_id = $1 returning id", [P1])
    if (removed.rows.length) throw new Error("author deleted a submitted report")
    for (const who of ["eng1", "client1"]) {
      await as(who)
      if ((await count("select count(*) n from public.daily_reports")) !== 1) throw new Error(who + " cannot read the submitted report")
    }
    await as("eng2")
    if ((await count("select count(*) n from public.daily_reports")) !== 0) throw new Error("outsider reads a report")
  })

  await test("An engineer can reopen a report; the author is notified and can edit and resubmit", async () => {
    await as("fore1")
    await expectFail("select public.reopen_daily_report(id) from public.daily_reports", [], /not allowed|not found/)
    await as("client1")
    await expectFail("select public.reopen_daily_report(id) from public.daily_reports", [], /not allowed|not found/)
    await as("eng1")
    await expectOk("select public.reopen_daily_report(id) from public.daily_reports")
    await asOwner()
    await expectFail("select public.reopen_daily_report(id) from public.daily_reports", [], /Only a submitted|not found/) // owner has no engineer role: refused
    await as("eng1")
    if ((await notes("fore1", "report.reopened")).length !== 1) throw new Error("author not notified of the reopen")
    await as("fore1")
    await expectOk("update public.daily_reports set work_done = 'Poured slab B and C' where project_id = $1", [P1])
    await expectOk("update public.daily_reports set status = 'submitted' where project_id = $1", [P1])
    if ((await notes("eng1", "report.submitted")).length !== 2) throw new Error("resubmission should notify again")
  })

  await test("Project, date and author cannot be changed; a direct status reset is refused", async () => {
    await as("fore1")
    const reset = await db.query("update public.daily_reports set status = 'draft' where project_id = $1 returning id", [P1])
    if (reset.rows.length) throw new Error("author reset a submitted report to draft")
    await db.query(`insert into public.daily_reports (project_id, report_date) values ($1, ${today} - 1)`, [P1])
    await expectFail(`update public.daily_reports set report_date = ${today} - 2 where report_date = ${today} - 1`, [], /permission denied|cannot change/)
    const own = await db.query("delete from public.daily_reports where report_date = (now() at time zone 'Asia/Manila')::date - 1 returning id")
    if (own.rows.length !== 1) throw new Error("author should be able to delete an own draft")
  })

  // ---------------------------------------------------------------- client questions
  const pin = await (async () => {
    await as("eng1", "aal2")
    const bp = (await db.query("insert into public.blueprints (project_id, title) values ($1, 'Question plan') returning id", [P1])).rows[0].id
    return (await db.query("insert into public.pins (project_id, blueprint_id, x, y, title) values ($1, $2, 10, 10, 'Lobby wall') returning id", [P1, bp])).rows[0].id
  })()

  await test("A client asks a question; engineers are notified; answer and author fields cannot be forged", async () => {
    await as("client1")
    const row = (await db.query("insert into public.project_questions (project_id, pin_id, question) values ($1, $2, 'When is the lobby wall finished?') returning *", [P1, pin])).rows[0]
    if (row.author_id !== ids.client1 || row.answer !== null) throw new Error("bad row: " + JSON.stringify(row))
    await expectFail("insert into public.project_questions (project_id, question, answer) values ($1, 'Another question', 'forged')", [P1], /permission denied/)
    const n = await notes("eng1", "question.new")
    if (n.length !== 1 || !/lobby wall/.test(n[0].body)) throw new Error("engineer not notified")
  })

  await test("Question rules: only clients ask, short text is refused, the pin must belong to the project", async () => {
    await as("fore1")
    await expectFail("insert into public.project_questions (project_id, question) values ($1, 'Foreman asking')", [P1], /row-level security/)
    await as("eng1")
    await expectFail("insert into public.project_questions (project_id, question) values ($1, 'Engineer asking')", [P1], /row-level security/)
    await as("client1")
    await expectFail("insert into public.project_questions (project_id, question) values ($1, 'x')", [P1], /check/)
    await expectFail("insert into public.project_questions (project_id, pin_id, question) values ($1, gen_random_uuid(), 'Unknown pin question')", [P1], /not part of this project/)
  })

  await test("A client sees only their own questions; staff see all; outsiders see none", async () => {
    await asOwner()
    await db.query("insert into public.profiles (id, email, role, status) select gen_random_uuid(), 'x@x.test', 'client', 'active' where false")
    await as("client1")
    if ((await count("select count(*) n from public.project_questions")) !== 1) throw new Error("client should see own question")
    await as("eng1")
    if ((await count("select count(*) n from public.project_questions")) !== 1) throw new Error("engineer should see the question")
    await as("fore1")
    if ((await count("select count(*) n from public.project_questions")) !== 1) throw new Error("foreman on the project should see the question")
    await as("eng2")
    if ((await count("select count(*) n from public.project_questions")) !== 0) throw new Error("outsider sees a question")
  })

  await test("Only an engineer of the project can answer; the client is notified; questions cannot be edited directly", async () => {
    await asOwner()
    const qid = (await db.query("select id from public.project_questions")).rows[0].id
    await as("client1")
    await expectFail("select public.answer_question($1, 'Self answer')", [qid], /not allowed|not found/)
    await as("eng2")
    await expectFail("select public.answer_question($1, 'Outsider answer')", [qid], /not allowed|not found/)
    await as("eng1")
    await expectFail("select public.answer_question($1, '   ')", [qid], /Write an answer/)
    await expectOk("select public.answer_question($1, 'Planned for next Friday.')", [qid])
    const row = (await db.query("select * from public.project_questions")).rows[0]
    if (row.answer !== "Planned for next Friday." || row.answered_by !== ids.eng1 || !row.answered_at) throw new Error("answer not stored")
    const n = await notes("client1", "question.answered")
    if (n.length !== 1 || !n[0].link.startsWith("/client/communication")) throw new Error("client not notified of the answer")
    await as("client1")
    await expectFail("update public.project_questions set question = 'edited'", [], /permission denied/)
    await expectFail("delete from public.project_questions", [], /permission denied/)
  })

  await test("Daily question limit applies", async () => {
    await as("client1")
    for (let i = 0; i < 19; i++) await db.query("insert into public.project_questions (project_id, question) values ($1, $2)", [P1, "Question number " + i])
    await expectFail("insert into public.project_questions (project_id, question) values ($1, 'One too many')", [P1], /many questions/)
  })
}
