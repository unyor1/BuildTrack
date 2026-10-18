import assert from "node:assert/strict"

export default async function({db,ids,as,asOwner,addUser,test,expectFail,count}) {
  await asOwner()
  for(const [key,role] of [["pendingEng","engineer"],["pendingFore","foreman"],["pendingOut","engineer"]]) await addUser(key,role)
  const project=(await db.query("insert into public.projects(code,name) values('PENDING-PIN','Pending pin test') returning id")).rows[0].id
  await db.query("insert into public.project_members(project_id,user_id) values($1,$2),($1,$3)",[project,ids.pendingEng,ids.pendingFore])
  const sheet=(await db.query("insert into public.blueprints(project_id,title) values($1,'Pending test plan') returning id",[project])).rows[0].id
  await as("pendingEng")
  const pins=(await db.query("insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values($1,$2,10,10,'Pending work A',$3),($1,$2,20,20,'Independent work B',$3) returning id",[project,sheet,ids.pendingFore])).rows.map(r=>r.id)
  const item=(await db.query("insert into public.pin_checklist_items(project_id,pin_id,text) values($1,$2,'Pending test step') returning id",[project,pins[0]])).rows[0].id
  const template=(await db.query("select public.save_qa_template(null,$1,'Pending test criteria','general',null,'{}',$2::jsonb) id",[project,JSON.stringify([{text:"Synthetic test observation",severity:"minor"}])])).rows[0].id
  await db.query("select public.approve_pin_qa_checklist($1,$2)",[pins[0],template])
  await as("pendingFore")
  await db.query("insert into public.pin_photos(project_id,pin_id,checklist_item_id,path) values($1,$2,$3,$4)",[project,pins[0],item,`${project}/${pins[0]}/test.jpg`])
  await db.query("update public.pin_checklist_items set done=true where id=$1",[item])
  const request=async(pin,title)=> (await db.query("select public.request_inspection($1,$2,$3,$4) id",[project,template,title,pin])).rows[0].id
  const finish=async(ir,result)=>{
    await as("pendingEng")
    await db.query("select public.start_inspection($1)",[ir])
    const qi=(await db.query("select id from public.qa_inspection_items where inspection_id=$1",[ir])).rows[0].id
    await db.query("select public.save_inspection_item($1,$2,null,$3)",[qi,result,result==='fail'?'Synthetic failure needing correction':null])
    await db.query("select public.complete_inspection($1,'Synthetic pending-pin outcome')",[ir])
  }
  const previous=await request(pins[0],'Old failed stage')
  await finish(previous,'fail')
  await as("pendingFore")
  const pending=await request(pins[0],'Current stage pending')
  await test("Pending pin: preflight identifies the exact request, not an unrelated pin, and does not expose other projects",async()=>{
    await as("pendingFore")
    assert.match((await db.query("select public.pin_qa_submission_problem($1) problem",[pins[0]])).rows[0].problem,/already pending.*IR-/)
    assert.equal((await db.query("select public.pin_qa_submission_problem($1) problem",[pins[1]])).rows[0].problem,null)
    await as("pendingOut")
    assert.equal((await db.query("select public.pin_qa_submission_problem($1) problem",[pins[0]])).rows[0].problem,'Access denied')
    await as(null)
    await expectFail("select public.pin_qa_submission_problem($1)",[pins[0]],/permission denied/)
  })
  const blockedRoutes=async()=>{
    await as("pendingFore")
    await expectFail("select public.request_inspection($1,$2,'Second stage',$3)",[project,template,pins[0]],/already pending/)
    await expectFail("select public.request_reinspection($1)",[previous],/already pending/)
    await expectFail("select public.submit_pin_qa($1)",[pins[0]],/already pending/)
    await expectFail("select public.submit_checklist_qa($1,$2::uuid[])",[pins[0],[item]],/already pending/)
    assert.equal(await count("select count(*) n from public.qa_inspections where pin_id=$1 and status in ('requested','in_progress')",[pins[0]]),1)
  }
  await test("Pending pin: requested QA blocks stage, old re-inspection, legacy and item submission routes",blockedRoutes)
  await test("Pending pin: starting inspection keeps every duplicate route blocked; another pin remains independent",async()=>{
    await as("pendingEng"); await db.query("select public.start_inspection($1)",[pending])
    await blockedRoutes()
    await request(pins[1],'Independent other pin')
    await request(null,'Independent unlinked stage')
    assert.equal(await count("select count(*) n from public.qa_inspections where project_id=$1 and status in ('requested','in_progress')",[project]),3)
  })
  await test("Pending pin: cancelling the current stage permits a linked retry; passed work still awaits item verification",async()=>{
    await as("pendingEng"); await db.query("select public.cancel_inspection($1,'Synthetic stage cancellation')",[pending])
    await as("pendingFore")
    const retry=(await db.query("select public.request_reinspection($1) id",[previous])).rows[0].id
    await expectFail("select public.request_inspection($1,$2,'Cannot bypass retry',$3)",[project,template,pins[0]],/already pending/)
    await as("pendingEng"); await db.query("select public.cancel_inspection($1,'Synthetic retry cancellation')",[retry])
    await as("pendingFore")
    const work=(await db.query("select public.submit_checklist_qa($1,$2::uuid[]) id",[pins[0],[item]])).rows[0].id
    await finish(work,'pass')
    await as("pendingFore")
    assert.match((await db.query("select public.pin_qa_submission_problem($1) problem",[pins[0]])).rows[0].problem,/pending Engineer item verification/)
    await expectFail("select public.submit_pin_qa($1)",[pins[0]],/pending Engineer item verification/)
    await expectFail("select public.request_inspection($1,$2,'Cannot bypass item review',$3)",[project,template,pins[0]],/pending Engineer item verification/)
  })
  await test("Pending pin: uniqueness independently rejects duplicates even without the advisory trigger",async()=>{
    await asOwner()
    await db.exec("alter table public.qa_inspections disable trigger a_one_open_inspection")
    try { await expectFail("insert into public.qa_inspections(project_id,number,template_id,title,trade,pin_id) values($1,90001,$2,'Duplicate test only','general',$3)",[project,template,pins[1]],/qa_one_pending_inspection_per_pin/) }
    finally { await db.exec("alter table public.qa_inspections enable trigger a_one_open_inspection") }
  })
}
