import assert from "node:assert/strict"

export default async function ({ db, ids, as, asOwner, test, expectFail, count, addUser }) {
  await asOwner()
  for (const [key, role] of [["wqEng","engineer"],["wqFore","foreman"],["wqOther","foreman"],["wqOff","foreman"]]) await addUser(key,role)
  const project=(await db.query("insert into public.projects(code,name,status) values('WORK-QA','Work QA regression','active') returning id")).rows[0].id
  await db.query("insert into public.project_members(project_id,user_id) values($1,$2),($1,$3),($1,$4),($1,$5),($1,$6)",[project,ids.wqEng,ids.wqFore,ids.wqOther,ids.wqOff,ids.client1])
  const sheet=(await db.query("insert into public.blueprints(project_id,title) values($1,'Test plan') returning id",[project])).rows[0].id
  await as("wqEng","aal2")
  const pin=(await db.query("insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values($1,$2,20,20,'Test work',$3) returning id",[project,sheet,ids.wqFore])).rows[0].id
  const items=(await db.query("insert into public.pin_checklist_items(pin_id,project_id,text) values($1,$2,'First test step'),($1,$2,'Second test step') returning id",[pin,project])).rows
  const template=(await db.query("select public.save_qa_template(null,$1,'Test-only criteria','general',null,'{}',$2::jsonb) id",[project,JSON.stringify([{text:"Test-only observation",severity:"minor"}])])).rows[0].id
  const addPhoto=async (item,name) => db.query("insert into public.pin_photos(pin_id,project_id,checklist_item_id,path) values($1,$2,$3,$4) returning id",[pin,project,item,`${project}/${pin}/${name}.jpg`])
  const pinStatus=async () => (await db.query("select status from public.pins where id=$1",[pin])).rows[0].status
  const submit=async () => (await db.query("select public.submit_pin_qa($1) id",[pin])).rows[0].id
  const finish=async (ir,result) => {
    await as("wqEng","aal2")
    await db.query("select public.start_inspection($1)",[ir])
    const item=(await db.query("select id from public.qa_inspection_items where inspection_id=$1",[ir])).rows[0].id
    await db.query("select public.save_inspection_item($1,$2,null,$3)",[item,result,result==="fail" ? "First test step does not match configured test criteria" : null])
    return (await db.query("select public.complete_inspection($1,'Test-only site findings') result",[ir])).rows[0].result
  }
  let partial, failed, final, original
  await test("Work QA: missing configuration is explicit and creates neither inspection nor submission", async () => {
    await as("wqFore")
    await expectFail("select public.submit_pin_qa($1)",[pin],/Select an available QA checklist/)
    assert.equal(await count("select count(*) n from public.qa_inspections where pin_id=$1",[pin]),0)
    assert.equal(await pinStatus(),"not_started")
    await as("wqEng","aal2")
    await db.query("select public.approve_pin_qa_checklist($1,$2)",[pin,template])
    await as("wqFore")
    await db.query("select public.select_pin_qa_checklist($1,$2)",[pin,template])
  })
  await test("Work QA: only the active assigned Foreman may submit, not Admin, Engineer, Client or another Foreman", async () => {
    for(const who of ["admin","super","wqEng","wqOther","eng2","client1"]) {
      await as(who,"aal2")
      await expectFail("select public.submit_pin_qa($1)",[pin],/active Foreman assigned/)
    }
    await asOwner()
    await db.query("update public.profiles set status='disabled' where id=$1",[ids.wqFore])
    await as("wqFore")
    await expectFail("select public.submit_pin_qa($1)",[pin],/active Foreman assigned/)
    await asOwner()
    await db.query("update public.profiles set status='active' where id=$1",[ids.wqFore])
  })
  await test("Foreman selects QA: Engineer/Admin/other Foreman cannot select; direct pin writes remain denied", async () => {
    for(const who of ["wqEng","admin","super","wqOther","client1","eng2"]) {
      await as(who,"aal2")
      await expectFail("select public.select_pin_qa_checklist($1,$2)",[pin,template],/assigned active Foreman/)
    }
    await as("wqEng","aal2")
    await db.query("select public.approve_pin_qa_checklist($1,$2)",[pin,template])
    await as("wqFore")
    assert.equal((await db.query("update public.pins set qa_template_id=null where id=$1 returning id",[pin])).rows.length,0)
    await asOwner()
    await db.query("update public.profiles set status='disabled' where id=$1",[ids.wqFore])
    await as("wqFore")
    await expectFail("select public.select_pin_qa_checklist($1,$2)",[pin,template],/assigned active Foreman/)
    await asOwner()
    await db.query("update public.profiles set status='active' where id=$1",[ids.wqFore])
    await as(null)
    await expectFail("select public.select_pin_qa_checklist($1,$2)",[pin,template],/permission denied/)
  })
  await test("Foreman selects QA: null, nonexistent, empty, archived and other-project templates are refused", async () => {
    await asOwner()
    const otherProject=(await db.query("insert into public.projects(code,name) values('WQ-OTHER','Other QA project') returning id")).rows[0].id
    const foreign=(await db.query("insert into public.qa_templates(project_id,name,trade) values($1,'Other project checklist','general') returning id",[otherProject])).rows[0].id
    const empty=(await db.query("insert into public.qa_templates(project_id,name,trade) values($1,'Empty checklist','general') returning id",[project])).rows[0].id
    await db.query("insert into public.qa_template_items(template_id,position,text) values($1,0,'Other project item')",[foreign])
    await as("wqFore")
    for(const candidate of [null,foreign,empty,"00000000-0000-0000-0000-000000000001"])
      await expectFail("select public.select_pin_qa_checklist($1,$2)",[pin,candidate],/available QA checklist/)
    await asOwner()
    await db.query("update public.qa_templates set archived=true where id=$1",[template])
    await as("wqFore")
    await expectFail("select public.select_pin_qa_checklist($1,$2)",[pin,template],/available QA checklist/)
    await asOwner()
    await db.query("update public.qa_templates set archived=false where id=$1",[template])
    await as("wqFore")
    await db.query("select public.select_pin_qa_checklist($1,$2)",[pin,template])
    assert.equal((await db.query("select qa_template_id from public.pins where id=$1",[pin])).rows[0].qa_template_id,template)
  })
  await test("Work QA: a completed item without its photo blocks submission; incomplete items are allowed", async () => {
    await as("wqFore")
    const ph=(await addPhoto(items[0].id,"temporary")).rows[0].id
    await db.query("update public.pin_checklist_items set done=true where id=$1",[items[0].id])
    await db.query("delete from public.pin_photos where id=$1",[ph])
    await expectFail("select public.submit_pin_qa($1)",[pin],/completed checklist item requires photo/)
    await addPhoto(items[0].id,"original")
    await addPhoto(items[0].id,"original-second-angle")
    await addPhoto(items[0].id,"original-third-angle")
    partial=await submit()
    assert.equal(await pinStatus(),"for_review")
    original=(await db.query("select * from public.pin_qa_submissions where inspection_id=$1",[partial])).rows[0]
    assert.equal(original.all_complete,false)
    assert.equal(original.submitted_by,ids.wqFore)
    assert.ok(original.submitted_at)
    assert.equal(original.checklist_snapshot.filter(i=>i.done).length,1)
    assert.equal(original.photos_snapshot.length,3)
    assert.ok(original.photos_snapshot.every(ph=>ph.checklist_item_id===items[0].id))
    const qaItems=(await db.query("select result from public.qa_inspection_items where inspection_id=$1",[partial])).rows
    assert.ok(qaItems.every(i=>i.result==="pending"),"Foreman done must not become Pass")
    await as("wqEng","aal2")
    assert.equal(await count("select count(*) n from public.notifications where entity_id=$1 and user_id=$2 and kind='qa.requested'",[partial,ids.wqEng]),1)
  })
  await test("Work QA: repeated simultaneous attempts create no duplicate open inspections", async () => {
    await as("wqFore")
    const attempts=await Promise.allSettled([submit(),submit()])
    assert.ok(attempts.every(r=>r.status==="rejected"))
    assert.equal(await count("select count(*) n from public.pin_qa_submissions where pin_id=$1",[pin]),1)
    await expectFail("select public.report_pin_progress($1,'for_review')",[pin],/Submit for QA/)
    await expectFail("select public.report_pin_progress($1,'in_progress')",[pin],/Awaiting Engineer/)
    await expectFail("select public.cancel_inspection($1,'Withdraw this work request')",[partial],/Only the project Engineer/)
    await expectFail("select public.select_pin_qa_checklist($1,$2)",[pin,template],/Finish the current review/)
    await expectFail("select public.request_inspection($1,$2,'Bypass',$3)",[project,template,pin],/already pending/)
  })
  await test("Work QA: checklist and evidence lock in review; snapshots are read-only and project-private", async () => {
    await as("wqFore")
    await expectFail("update public.pin_checklist_items set remark='changed' where id=$1",[items[0].id],/locked/)
    await expectFail("update public.pin_checklist_items set done=false where id=$1",[items[0].id],/locked/)
    await expectFail("insert into public.pin_photos(pin_id,project_id,path) values($1,$2,$3)",[pin,project,`${project}/${pin}/late.jpg`],/locked/)
    await expectFail("delete from public.pin_photos where pin_id=$1",[pin],/locked|evidence/)
    const qi=(await db.query("select id from public.qa_inspection_items where inspection_id=$1",[partial])).rows[0].id
    await expectFail("insert into public.qa_photos(project_id,item_id,path) values($1,$2,$3)",[project,qi,`${project}/late.jpg`],/locked/)
    await expectFail("update public.pin_qa_submissions set all_complete=true where inspection_id=$1",[partial],/permission denied/)
    await as("wqEng","aal2")
    await expectFail("update public.pin_checklist_items set text='changed' where id=$1",[items[0].id],/locked/)
    await expectFail("update public.pins set assigned_to=$2 where id=$1",[pin,ids.wqOther],/Awaiting Engineer/)
    for(const who of ["client1","eng2"]) {
      await as(who)
      assert.equal(await count("select count(*) n from public.pin_qa_submissions where pin_id=$1",[pin]),0)
    }
  })
  await test("Work QA: a partial Pass reopens unfinished work and cannot verify it", async () => {
    await finish(partial,"pass")
    assert.equal(await pinStatus(),"in_progress")
    await expectFail("update public.pins set status='verified' where id=$1",[pin],/Every checklist item/)
    await as("wqFore")
    await addPhoto(items[1].id,"second")
    await db.query("update public.pin_checklist_items set done=true where id=$1",[items[1].id])
    await as("wqEng","aal2")
    await expectFail("update public.pins set status='verified' where id=$1",[pin],/complete work submission must pass/)
  })
  await test("Work QA: failure requires item findings, creates an NCR and returns work for correction", async () => {
    await as("wqFore")
    failed=await submit()
    await as("wqEng","aal2")
    await db.query("select public.start_inspection($1)",[failed])
    const qi=(await db.query("select id from public.qa_inspection_items where inspection_id=$1",[failed])).rows[0].id
    await expectFail("select public.save_inspection_item($1,'fail',null,'')",[qi],/reason|wrong|remarks|characters/i)
    await db.query("select public.save_inspection_item($1,'fail',null,'First test step does not match configured criteria')",[qi])
    await db.query("select public.complete_inspection($1,'First test step requires correction')",[failed])
    assert.equal(await pinStatus(),"in_progress")
    assert.equal(await count("select count(*) n from public.qa_defects where inspection_id=$1 and assigned_to=$2",[failed,ids.wqFore]),1)
    await expectFail("update public.pins set status='verified' where id=$1",[pin],/open defects/)
    await expectFail("select public.request_reinspection($1)",[failed],/Resubmit from/)
  })
  await test("Work QA: corrections append evidence, preserve snapshots, and require a passed linked resubmission", async () => {
    await as("wqFore")
    await addPhoto(items[0].id,"corrected")
    await db.query("update public.pin_checklist_items set remark='Corrected first test step' where id=$1",[items[0].id])
    await expectFail("delete from public.pin_photos where pin_id=$1",[pin],/evidence/)
    const ncr=(await db.query("select id from public.qa_defects where inspection_id=$1",[failed])).rows[0].id
    await db.query("select public.update_defect($1,'in_progress')",[ncr])
    await db.query("select public.update_defect($1,'for_verification','First test step corrected against configured criteria')",[ncr])
    await as("wqEng","aal2")
    await db.query("select public.verify_defect($1,true,'Correction inspected against configured test criteria')",[ncr])
    await expectFail("update public.pins set status='verified' where id=$1",[pin],/complete work submission must pass/)
    await as("wqFore")
    final=await submit()
    assert.equal((await db.query("select reinspection_of from public.qa_inspections where id=$1",[final])).rows[0].reinspection_of,failed)
    const stored=(await db.query("select * from public.pin_qa_submissions where inspection_id=$1",[partial])).rows[0]
    assert.deepEqual(stored,original)
    await as("wqEng","aal2")
    await expectFail("update public.pins set status='verified' where id=$1",[pin],/inspection.*still open/)
    await finish(final,"pass")
    assert.equal(await pinStatus(),"for_review")
    await db.query("update public.pins set status='verified' where id=$1",[pin])
    const verified=(await db.query("select verified_by,verified_at from public.pins where id=$1",[pin])).rows[0]
    assert.equal(verified.verified_by,ids.wqEng)
    assert.ok(verified.verified_at)
  })
  await test("Work QA: Admin and Foreman cannot record results or verify work", async () => {
    for(const who of ["admin","wqFore"]) {
      await as(who,"aal2")
      await expectFail("select public.start_inspection($1)",[final],/not allowed|not found/i)
      assert.equal((await db.query("update public.pins set status='verified' where id=$1 returning id",[pin])).rows.length,0)
    }
  })
  await test("Work QA: reopened changed work invalidates the old Pass; send-back needs a reason", async () => {
    await as("wqEng","aal2")
    await db.query("update public.pins set status='in_progress' where id=$1",[pin])
    await as("wqFore")
    await db.query("update public.pin_checklist_items set remark='New observation after reopening' where id=$1",[items[0].id])
    await as("wqEng","aal2")
    await expectFail("update public.pins set status='verified' where id=$1",[pin],/Work changed/)
    await as("wqFore")
    const ir=await submit()
    await as("wqEng","aal2")
    await expectFail("select public.return_pin_for_correction($1,'')",[pin],/affected items.*correction reason/)
    await db.query("select public.return_pin_for_correction($1,'First test step needs another correction')",[pin])
    assert.equal(await pinStatus(),"in_progress")
    assert.equal((await db.query("select status from public.qa_inspections where id=$1",[ir])).rows[0].status,"cancelled")
    assert.ok(await count("select count(*) n from public.pin_events where pin_id=$1 and note like 'Sent back: First test step%'",[pin]))
  })
  await test("Work QA: transactional failure rolls back inspection, snapshot, notification and pin status", async () => {
    await asOwner()
    const before=await count("select count(*) n from public.qa_inspections where pin_id=$1",[pin])
    const notifications=await count("select count(*) n from public.notifications where project_id=$1",[project])
    await db.exec(`create function public.test_work_qa_abort() returns trigger language plpgsql as $$ begin
      if new.status='for_review' then raise exception 'Test-only forced write failure'; end if; return new; end $$;
      create trigger z_test_work_qa_abort before update of status on public.pins for each row execute function public.test_work_qa_abort();`)
    await as("wqFore")
    await expectFail("select public.submit_pin_qa($1)",[pin],/forced write failure/)
    assert.equal(await count("select count(*) n from public.qa_inspections where pin_id=$1",[pin]),before)
    assert.equal(await count("select count(*) n from public.pin_qa_submissions where pin_id=$1",[pin]),before)
    assert.equal(await pinStatus(),"in_progress")
    await asOwner()
    assert.equal(await count("select count(*) n from public.notifications where project_id=$1",[project]),notifications)
    await db.exec("drop trigger z_test_work_qa_abort on public.pins; drop function public.test_work_qa_abort()")
  })
  await test("Work QA: two fresh submission attempts yield one success and one refusal", async () => {
    await as("wqFore")
    const attempts=await Promise.allSettled([submit(),submit()])
    assert.equal(attempts.filter(r=>r.status==="fulfilled").length,1)
    assert.equal(attempts.filter(r=>r.status==="rejected").length,1)
    assert.equal(await count("select count(*) n from public.qa_inspections where pin_id=$1 and status in ('requested','in_progress')",[pin]),1)
    await as("wqEng","aal2")
    await db.query("select public.return_pin_for_correction($1,'First step returned for test cleanup')",[pin])
  })
  await test("Work QA: existing stage and hold-point inspections remain independent prerequisites", async () => {
    await as("wqFore")
    const stage=(await db.query("select public.request_inspection($1,$2,'Stage hold-point check',$3) id",[project,template,pin])).rows[0].id
    await expectFail("select public.submit_pin_qa($1)",[pin],/already pending/)
    await as("wqEng","aal2")
    await expectFail("update public.pins set status='verified' where id=$1",[pin],/inspection.*still open/)
    await db.query("select public.cancel_inspection($1,'Test stage cancelled with reason')",[stage])
    await as("wqFore")
    const ir=await submit()
    // Isolate the conditional-state gate from the independent open-NCR gate.
    await asOwner()
    await db.query("update public.qa_inspections set status='conditional',completed_at=now() where id=$1",[ir])
    await as("wqEng","aal2")
    assert.equal(await pinStatus(),"in_progress")
    await expectFail("update public.pins set status='verified' where id=$1",[pin],/complete work submission must pass/)
  })
  await test("Work QA: internal snapshot/legacy writers cannot be called from the API", async () => {
    await as("wqFore")
    await expectFail("select public.pin_qa_checklist($1)",[pin],/permission denied/)
    await expectFail("select public.request_stage_reinspection($1,null)",[failed],/permission denied/)
    await expectFail("select public.request_stage_inspection($1,$2,'Bypass',$3,null,null)",[project,template,pin],/permission denied/)
  })
}
