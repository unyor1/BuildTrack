import assert from "node:assert/strict"

export default async function(ctx) {
  const { db, ids, as, asOwner, addUser, test, expectFail, count } = ctx
  await asOwner()
  for (const [key, role] of [["revEng","engineer"],["revFore","foreman"],["revClient","client"],["revOut","engineer"]]) await addUser(key,role)
  const project = (await db.query("insert into public.projects(code,name,site_lat,site_lng) values('REVIEW-44','Review workflow site',14.5,121) returning id")).rows[0].id
  await db.query("insert into public.project_members(project_id,user_id) values($1,$2),($1,$3),($1,$4)",[project,ids.revEng,ids.revFore,ids.revClient])
  const sheet = (await db.query("insert into public.blueprints(project_id,title) values($1,'Review plan') returning id",[project])).rows[0].id
  await as("revEng")
  const pin = (await db.query("insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values($1,$2,10,10,'Two work steps',$3) returning id",[project,sheet,ids.revFore])).rows[0].id
  const steps = (await db.query("insert into public.pin_checklist_items(project_id,pin_id,text) values($1,$2,'Step A'),($1,$2,'Step B') returning id",[project,pin])).rows.map(r=>r.id)
  const template = (await db.query("select public.save_qa_template(null,$1,'Test observation only','general',null,'{}',$2::jsonb) id",[project,JSON.stringify([{ text:"Synthetic test observation", severity:"minor" }])])).rows[0].id
  let first, second, report, badPhoto
  const finish = async id => {
    await as("revEng")
    await db.query("select public.start_inspection($1)",[id])
    for (const item of (await db.query("select id from public.qa_inspection_items where inspection_id=$1",[id])).rows) await db.query("select public.save_inspection_item($1,'pass')",[item.id])
    await db.query("select public.complete_inspection($1,'Synthetic test result')",[id])
  }
  await test("Item QA: only Engineer approves criteria; Foreman cannot change approval or forge review fields",async()=>{
    await as("revFore")
    await expectFail("select public.select_pin_qa_checklist($1,$2)",[pin,template],/Engineer.*approve/)
    await expectFail("select public.approve_pin_qa_checklist($1,$2)",[pin,template],/Only the project Engineer/)
    await expectFail("update public.pin_checklist_items set review_status='verified' where id=$1",[steps[0]],/permission denied/)
    await as("revEng")
    await expectFail("insert into public.pin_checklist_items(project_id,pin_id,text,review_status) values($1,$2,'Forged','verified')",[project,pin],/permission denied/)
    await db.query("select public.approve_pin_qa_checklist($1,$2)",[pin,template])
    await as("revFore")
    await db.query("select public.select_pin_qa_checklist($1,$2)",[pin,template])
  })
  await test("Evidence: a wrong-time image (phone clock ahead) is retained but cannot satisfy a QA submission",async()=>{
    await as("revFore")
    badPhoto = (await db.query("insert into public.pin_photos(project_id,pin_id,checklist_item_id,path,lat,lng,taken_at) values($1,$2,$3,$4,14.5,121,now()+interval '1 hour') returning *",[project,pin,steps[0],`${project}/${pin}/ahead.jpg`])).rows[0]
    assert.equal(badPhoto.stamp_flag,"clock_ahead")
    await db.query("update public.pin_checklist_items set done=true where id=$1",[steps[0]])
    await expectFail("select public.submit_checklist_qa($1,$2::uuid[])",[pin,[steps[0]]],/eligible photo/)
    for (const step of steps) {
      await db.query("insert into public.pin_photos(project_id,pin_id,checklist_item_id,path,lat,lng,taken_at) values($1,$2,$3,$4,14.5,121,now())",[project,pin,step,`${project}/${pin}/${step}.jpg`])
      await db.query("update public.pin_checklist_items set done=true where id=$1",[step])
    }
    first = (await db.query("select public.submit_checklist_qa($1,$2::uuid[]) id",[pin,[steps[0]]])).rows[0].id
    assert.equal((await db.query("select review_status from public.pin_checklist_items where id=$1",[steps[0]])).rows[0].review_status,"for_review")
    assert.equal((await db.query("select review_status from public.pin_checklist_items where id=$1",[steps[1]])).rows[0].review_status,"not_submitted")
  })
  await test("Pending QA: different items can be requested concurrently; legacy whole-pin and stage routes stay guarded",async()=>{
    await as("revFore")
    second=(await db.query("select public.submit_checklist_qa($1,$2::uuid[]) id",[pin,[steps[1]]])).rows[0].id
    await expectFail("select public.submit_pin_qa($1)",[pin],/already pending/)
    await expectFail("select public.request_inspection($1,$2,'Different stage title',$3)",[project,template,pin],/already pending/)
    assert.equal(await count("select count(*) n from public.qa_inspections where pin_id=$1 and status in ('requested','in_progress')",[pin]),2)
    await as("revEng")
    await expectFail("select public.review_checklist_item($1,true)",[steps[0]],/pending QA/)
  })
  await test("Item QA: a passed inspection still needs Engineer item verification; other steps stay unaccepted",async()=>{
    await finish(first)
    await as("revFore")
    await expectFail("select public.submit_checklist_qa($1,$2::uuid[])",[pin,[steps[1]]],/already pending/)
    await expectFail("select public.review_checklist_item($1,true)",[steps[0]],/Only the project Engineer/)
    await as("revEng")
    await db.query("select public.review_checklist_item($1,true)",[steps[0]])
    const item = (await db.query("select * from public.pin_checklist_items where id=$1",[steps[0]])).rows[0]
    assert.equal(item.review_status,"verified"); assert.equal(item.verified_by,ids.revEng); assert.ok(item.verified_at)
    assert.equal((await db.query("select status from public.pins where id=$1",[pin])).rows[0].status,"for_review")
    await expectFail("update public.pins set status='verified' where id=$1",[pin],/Every checklist item|still open|Awaiting Engineer/)
    await as("revFore")
    await expectFail("update public.pin_checklist_items set remark='Changed after acceptance' where id=$1",[steps[0]],/Reopen/)
  })
  await test("Completion: accepting the last passed item completes work; reopening one item returns the overall work to progress",async()=>{
    await finish(second)
    await db.query("select public.review_checklist_item($1,true)",[steps[1]])
    const pn=(await db.query("select status,verified_by,verified_at from public.pins where id=$1",[pin])).rows[0]
    assert.equal(pn.status,"verified"); assert.equal(pn.verified_by,ids.revEng); assert.ok(pn.verified_at)
    await expectFail("select public.review_checklist_item($1,false,'')",[steps[0]],/correction reason/)
    await db.query("select public.review_checklist_item($1,false,'Recheck the test observation')",[steps[0]])
    assert.equal((await db.query("select status from public.pins where id=$1",[pin])).rows[0].status,"in_progress")
  })
  await test("Photo access: Engineer cannot obtain a rejected image through Storage; author and valid evidence remain available",async()=>{
    await asOwner()
    await db.query("insert into storage.objects(bucket_id,name,owner) values('pin-photos',$1,$2)",[badPhoto.path,ids.revFore])
    await as("revEng")
    assert.equal(await count("select count(*) n from storage.objects where name=$1",[badPhoto.path]),0)
    assert.equal((await db.query("select public.evidence_image_allowed('pin-photos',$1) allowed",[badPhoto.path])).rows[0].allowed,false)
    assert.equal(await count("select count(*) n from public.pin_photos where id=$1",[badPhoto.id]),1)
    await as("revFore")
    assert.equal(await count("select count(*) n from storage.objects where name=$1",[badPhoto.path]),1)
  })
  await test("Stage QA: two generic requests cannot bypass pending QA; schedules require an active project Engineer",async()=>{
    await as("revFore")
    const stage=(await db.query("select public.request_inspection($1,$2,'Stage test',$3) id",[project,template,pin])).rows[0].id
    await expectFail("select public.request_inspection($1,$2,'Another stage',$3)",[project,template,pin],/already pending/)
    await expectFail("select public.set_inspection_schedule($1,now(),$2)",[stage,ids.revEng],/Only the project Engineer/)
    await as("revEng")
    await expectFail("select public.set_inspection_schedule($1,now(),$2)",[stage,ids.revOut],/active project Engineer/)
    await db.query("select public.set_inspection_schedule($1,now()-interval '1 hour',$2)",[stage,ids.revEng])
    await db.query("select public.generate_inspection_reminders()")
    await db.query("select public.generate_inspection_reminders()")
    assert.equal(await count("select count(*) n from public.notifications where entity_id=$1 and kind='qa.overdue'",[stage]),1)
    await db.query("select public.cancel_inspection($1,'Stage cancelled for test cleanup')",[stage])
  })
  await test("Daily reports: submit snapshots linked work items; Engineer feedback returns a revision without overwriting history",async()=>{
    await as("revFore")
    report=(await db.query("insert into public.daily_reports(project_id,report_date,work_done,workers_count,linked_work) values($1,(now() at time zone 'Asia/Manila')::date,'Test daily work',12,$2::jsonb) returning id",[project,JSON.stringify([{pin_id:pin,item_id:steps[0]}])])).rows[0].id
    await db.query("update public.daily_reports set status='submitted' where id=$1",[report])
    await expectFail("select public.review_daily_report($1,true,'Looks correct')",[report],/Only the project Engineer/)
    await as("revEng")
    await expectFail("select public.review_daily_report($1,false,'')",[report],/review feedback/)
    await db.query("select public.review_daily_report($1,false,'Explain what was done on Step A')",[report])
    await as("revFore")
    await db.query("update public.daily_reports set work_done='Corrected test daily work',status='submitted' where id=$1",[report])
    assert.equal((await db.query("select revision from public.daily_reports where id=$1",[report])).rows[0].revision,2)
    await as("revEng")
    await db.query("select public.review_daily_report($1,true,'Reviewed the corrected site report')",[report])
    const history=(await db.query("select event,snapshot from public.daily_report_revisions where report_id=$1 order by created_at,id",[report])).rows
    assert.equal(history.length,4)
    assert.equal(history.filter(r=>r.event==='submitted' && r.snapshot.work_done==='Test daily work').length,1)
    assert.equal((await db.query("select review_state from public.daily_reports where id=$1",[report])).rows[0].review_state,"reviewed")
    await expectFail("update public.daily_report_revisions set event='forged' where report_id=$1",[report],/permission denied/)
    await as("revClient")
    assert.equal(await count("select count(*) n from public.daily_report_revisions where report_id=$1",[report]),0)
    await as("revOut")
    assert.equal(await count("select count(*) n from public.daily_report_revisions where report_id=$1",[report]),0)
  })
  await test("Biometric reconciliation: only project Engineer imports real totals; bounds and project RLS apply",async()=>{
    await as("revFore")
    await expectFail("select public.import_biometric_total($1,current_date,11,'Device export')",[project],/Only the project Engineer/)
    await as("revEng")
    await expectFail("select public.import_biometric_total($1,current_date,-1,'Device export')",[project],/check/)
    await db.query("select public.import_biometric_total($1,(now() at time zone 'Asia/Manila')::date,11,'Test device export')",[project])
    assert.equal((await db.query("select workers_count from public.biometric_daily_totals where project_id=$1",[project])).rows[0].workers_count,11)
    await as("revOut")
    assert.equal(await count("select count(*) n from public.biometric_daily_totals where project_id=$1",[project]),0)
  })
}
