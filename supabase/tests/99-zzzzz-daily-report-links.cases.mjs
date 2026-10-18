import assert from "node:assert/strict"

// 20261018170444: daily report links are a work pin + the checklist item worked on (no quantities).
export default async function ({ db, ids, as, asOwner, addUser, test, expectFail }) {
  await asOwner()
  for (const [key, role] of [["linkEng", "engineer"], ["linkFore", "foreman"]]) await addUser(key, role)
  const project = (await db.query("insert into public.projects(code,name) values('LINK-DR','Daily report links') returning id")).rows[0].id
  const other = (await db.query("insert into public.projects(code,name) values('LINK-OTHER','Other project') returning id")).rows[0].id
  await db.query("insert into public.project_members(project_id,user_id) values($1,$2),($1,$3),($4,$2)", [project, ids.linkEng, ids.linkFore, other])
  await as("linkEng")
  const sheet = (await db.query("insert into public.blueprints(project_id,title) values($1,'Links plan') returning id", [project])).rows[0].id
  const otherSheet = (await db.query("insert into public.blueprints(project_id,title) values($1,'Other plan') returning id", [other])).rows[0].id
  const pin = (await db.query("insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values($1,$2,10,10,'LAUNDRY',$3) returning id", [project, sheet, ids.linkFore])).rows[0].id
  const bare = (await db.query("insert into public.pins(project_id,blueprint_id,x,y,title) values($1,$2,20,20,'No checklist yet') returning id", [project, sheet])).rows[0].id
  const otherPin = (await db.query("insert into public.pins(project_id,blueprint_id,x,y,title) values($1,$2,30,30,'Elsewhere') returning id", [other, otherSheet])).rows[0].id
  const floor = (await db.query("insert into public.pin_checklist_items(project_id,pin_id,text) values($1,$2,'FLOOR') returning id", [project, pin])).rows[0].id
  const otherItem = (await db.query("insert into public.pin_checklist_items(project_id,pin_id,text) values($1,$2,'WALL') returning id", [other, otherPin])).rows[0].id
  const insert = (links) => db.query("insert into public.daily_reports(project_id,report_date,work_done,workers_count,linked_work) values($1,(now() at time zone 'Asia/Manila')::date,'Linked work test',5,$2::jsonb) returning id", [project, JSON.stringify(links)])

  let report
  await test("Daily report links: a pin with checklist items needs one of its own items; quantities are refused", async () => {
    await as("linkFore")
    await expectFail("insert into public.daily_reports(project_id,report_date,work_done,workers_count,linked_work) values($1,(now() at time zone 'Asia/Manila')::date,'x',1,$2::jsonb)", [project, JSON.stringify([{ pin_id: pin }])], /Choose the checklist item/)
    await expectFail("insert into public.daily_reports(project_id,report_date,work_done,workers_count,linked_work) values($1,(now() at time zone 'Asia/Manila')::date,'x',1,$2::jsonb)", [project, JSON.stringify([{ pin_id: pin, item_id: otherItem }])], /checklist item of the linked work pin/)
    await expectFail("insert into public.daily_reports(project_id,report_date,work_done,workers_count,linked_work) values($1,(now() at time zone 'Asia/Manila')::date,'x',1,$2::jsonb)", [project, JSON.stringify([{ pin_id: otherPin, item_id: otherItem }])], /belong to this project/)
    await expectFail("insert into public.daily_reports(project_id,report_date,work_done,workers_count,linked_work) values($1,(now() at time zone 'Asia/Manila')::date,'x',1,$2::jsonb)", [project, JSON.stringify([{ pin_id: pin, item_id: floor, planned: 10, actual: 8, unit: "pcs" }])], /only the work pin and its checklist item/)
    report = (await insert([{ pin_id: pin, item_id: floor }, { pin_id: bare, item_id: null }])).rows[0].id
    assert.deepEqual((await db.query("select linked_work from public.daily_reports where id=$1", [report])).rows[0].linked_work, [{ pin_id: pin, item_id: floor }, { pin_id: bare, item_id: null }])
  })

  await test("Daily report links: a pin that gains checklist items later does not block review of a submitted report", async () => {
    await as("linkFore")
    await db.query("update public.daily_reports set status='submitted' where id=$1", [report])
    await as("linkEng")
    await db.query("insert into public.pin_checklist_items(project_id,pin_id,text) values($1,$2,'CEILING')", [project, bare])
    await db.query("select public.review_daily_report($1,true,'Reviewed the linked work items')", [report])
    assert.equal((await db.query("select review_state from public.daily_reports where id=$1", [report])).rows[0].review_state, "reviewed")
  })
}
