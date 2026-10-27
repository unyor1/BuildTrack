import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { passWorkFixture, submitWorkFixture } from "./qa-fixtures.mjs"

export default async function(ctx) {
  const {db,ids,as,asOwner,addUser,test,expectFail}=ctx
  await asOwner()
  for(const [name,role] of [["issueEng","engineer"],["issueFore","foreman"],["issueClient","client"],["issueOut","engineer"]]) await addUser(name,role)
  const project=(await db.query("insert into public.projects(code,name) values('ISSUE-PHOTO','Issue photo test') returning id")).rows[0].id
  const other=(await db.query("insert into public.projects(code,name) values('ISSUE-OTHER','Other issue project') returning id")).rows[0].id
  await db.query("insert into public.project_members(project_id,user_id) values($1,$2),($1,$3),($1,$4),($5,$2)",[project,ids.issueEng,ids.issueFore,ids.issueClient,other])
  await as("issueEng")
  const sheet=(await db.query("insert into public.blueprints(project_id,title) values($1,'Issue zone') returning id",[project])).rows[0].id
  const otherSheet=(await db.query("insert into public.blueprints(project_id,title) values($1,'Other zone') returning id",[other])).rows[0].id
  const pin=(await db.query("insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values($1,$2,20,20,'Issue work',$3) returning id",[project,sheet,ids.issueFore])).rows[0].id
  const another=(await db.query("insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values($1,$2,30,30,'Another work',$3) returning id",[project,sheet,ids.issueFore])).rows[0].id
  const foreign=(await db.query("insert into public.pins(project_id,blueprint_id,x,y,title) values($1,$2,40,40,'Other work') returning id",[other,otherSheet])).rows[0].id
  const report=randomUUID()
  const mark={id:"line-test",kind:"arrow",x:10,y:20,x2:70,y2:80,color:"#d93a3a",stroke:4,fontSize:30,text:"",points:[]}
  const upload=async(pid=pin,pj=project,who="issueEng")=>{
    await as(who)
    const path=`${pj}/${pid}/${randomUUID()}.png`
    await db.query("insert into storage.objects(bucket_id,name,owner) values('issue-photos',$1,$2)",[path,ids[who]])
    return path
  }
  const count=async(table)=>Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n)
  const log=(id,target,photos=[])=>db.query("select public.log_site_issue($1,$2,'high','Synthetic site issue description',$3::jsonb) id",[id,target,JSON.stringify(photos)])
  let first,second,photo

  await test("Site issue markup: database rejects executable/unknown data, duplicate IDs and out-of-range geometry",async()=>{
    await as("issueEng")
    for(const value of [[{...mark,kind:"script"}],[{...mark,color:"url(evil)"}],[{...mark,x:101}],[mark,mark],[{...mark,points:[{x:null,y:0}]}],[{...mark,onload:"evil"}]]) {
      assert.equal((await db.query("select public.valid_issue_markup($1::jsonb) ok",[JSON.stringify(value)])).rows[0].ok,false)
    }
    assert.equal((await db.query("select public.valid_issue_markup($1::jsonb) ok",[JSON.stringify([mark])])).rows[0].ok,true)
  })

  await test("Site issues: Foreman/client/outsider cannot log or upload; the project Engineer can upload originals",async()=>{
    for(const who of ["issueFore","issueClient","issueOut"]) {
      await as(who)
      await expectFail("select public.log_site_issue($1,$2,'high','Forbidden issue','[]')",[randomUUID(),pin],/Only the project Engineer/)
      await expectFail("insert into storage.objects(bucket_id,name,owner) values('issue-photos',$1,$2)",[`${project}/${pin}/${randomUUID()}.png`,ids[who]],/row-level security/)
    }
    first=await upload();second=await upload()
  })

  await test("Site issues: one transaction saves pin status, description, timeline and multiple photos; retry is idempotent",async()=>{
    await as("issueEng")
    const photos=[{path:first,caption:"First original",annotations:[mark]},{path:second,caption:"Second original",annotations:[]}]
    assert.equal((await log(report,pin,photos)).rows[0].id,report)
    const pn=(await db.query("select * from public.pins where id=$1",[pin])).rows[0]
    assert.equal(pn.status,"issue");assert.equal(pn.severity,"high")
    assert.equal((await db.query("select description from public.site_issue_reports where id=$1",[report])).rows[0].description,"Synthetic site issue description")
    const rows=(await db.query("select * from public.site_issue_photos where report_id=$1 order by caption",[report])).rows
    assert.equal(rows.length,2);photo=rows[0]
    assert.deepEqual(photo.annotations,[mark])
    assert.equal((await db.query("select count(*) n from public.pin_events where pin_id=$1 and note='Issue: Synthetic site issue description'",[pin])).rows[0].n,1)
    await log(report,pin,photos)
    assert.equal((await db.query("select count(*) n from public.site_issue_photos where report_id=$1",[report])).rows[0].n,2)
  })

  await test("Site issues: missing files, another pin's files and malformed markup roll back the whole issue",async()=>{
    await as("issueEng")
    const before=await count("site_issue_reports")
    for(const photos of [[{path:`${project}/${another}/missing.png`}],[{path:first}],[{path:first,annotations:[{...mark,x:-1}]}]]) {
      await expectFail("select public.log_site_issue($1,$2,'high','Must roll back',$3::jsonb)",[randomUUID(),another,JSON.stringify(photos)],/Upload your photo|Invalid photo markup/)
      assert.equal((await db.query("select status from public.pins where id=$1",[another])).rows[0].status,"not_started")
      assert.equal(await count("site_issue_reports"),before)
    }
  })

  await test("Site issues: Foreman reads descriptions, annotated photos and versions; clients/outsiders read none",async()=>{
    await as("issueFore")
    assert.equal((await db.query("select count(*) n from public.site_issue_reports where id=$1",[report])).rows[0].n,1)
    assert.equal((await db.query("select count(*) n from public.site_issue_photos where report_id=$1",[report])).rows[0].n,2)
    assert.equal((await db.query("select count(*) n from storage.objects where bucket_id='issue-photos' and name=$1",[first])).rows[0].n,1)
    for(const who of ["issueClient","issueOut"]) {
      await as(who)
      for(const table of ["site_issue_reports","site_issue_photos","site_issue_photo_revisions"]) assert.equal(await count(table),0)
      assert.equal((await db.query("select count(*) n from storage.objects where bucket_id='issue-photos'",[])).rows[0].n,0)
    }
  })

  await test("Site issues: photo edits are versioned, preserve originals and reject stale saves; no direct metadata writes",async()=>{
    await as("issueFore")
    await expectFail("select public.save_site_issue_photo($1,1,'[]','tampered')",[photo.id],/Only the project Engineer/)
    await as("issueEng")
    assert.equal((await db.query("select public.save_site_issue_photo($1,1,'[]','Updated caption') v",[photo.id])).rows[0].v,2)
    const saved=(await db.query("select * from public.site_issue_photos where id=$1",[photo.id])).rows[0]
    assert.equal(saved.path,photo.path);assert.equal(saved.caption,"Updated caption")
    const old=(await db.query("select * from public.site_issue_photo_revisions where photo_id=$1 and version=1",[photo.id])).rows[0]
    assert.deepEqual(old.annotations,[mark]);assert.equal(old.caption,"First original")
    await expectFail("select public.save_site_issue_photo($1,1,'[]','Stale overwrite')",[photo.id],/edited by someone else/)
    await expectFail("update public.site_issue_photos set path='tamper' where id=$1",[photo.id],/permission denied/)
    await expectFail("delete from public.site_issue_photo_revisions where photo_id=$1",[photo.id],/permission denied/)
    assert.equal((await db.query("update storage.objects set name='tamper' where bucket_id='issue-photos' and name=$1 returning id",[first])).rows.length,0)
  })

  await test("Site issues: attached originals stay protected even after the uploader loses project access",async()=>{
    await asOwner()
    await db.query("update public.profiles set status='disabled' where id=$1",[ids.issueEng])
    await as("issueEng")
    assert.equal((await db.query("delete from storage.objects where bucket_id='issue-photos' and name=$1 returning id",[first])).rows.length,0)
    await asOwner()
    await db.query("update public.profiles set status='active' where id=$1",[ids.issueEng])
    const unused=await upload()
    assert.equal((await db.query("delete from storage.objects where bucket_id='issue-photos' and name=$1 returning id",[unused])).rows.length,1)
  })

  await test("Site issues: append photos and enforce the 40-photo cap in the database",async()=>{
    const extra=await upload()
    await db.query("select public.add_site_issue_photos($1,$2::jsonb)",[report,JSON.stringify([{path:extra}])])
    assert.equal((await db.query("select count(*) n from public.site_issue_photos where report_id=$1",[report])).rows[0].n,3)
    await expectFail("select public.add_site_issue_photos($1,$2::jsonb)",[report,JSON.stringify(Array.from({length:38},()=>({path:first})))],/At most 40/)
    await expectFail("select public.insert_site_issue_photos($1,'[]')",[report],/permission denied/)
  })

  await test("Site issues: returning to the Foreman is atomic; pin state remains the progress/zone source of truth",async()=>{
    await as("issueEng")
    await expectFail("select public.return_site_issue($1,'x')",[pin],/5 to 1000/)
    assert.equal((await db.query("select status from public.pins where id=$1",[pin])).rows[0].status,"issue")
    await db.query("select public.return_site_issue($1,'Synthetic correction instructions')",[pin])
    assert.equal((await db.query("select status from public.pins where id=$1",[pin])).rows[0].status,"in_progress")
    assert.equal((await db.query("select count(*) n from public.site_issue_reports where pin_id=$1",[pin])).rows[0].n,1)
    assert.equal((await db.query("select count(*) n from public.pin_events where pin_id=$1 and note='Please fix: Synthetic correction instructions'",[pin])).rows[0].n,1)
    await expectFail("select public.return_site_issue($1,'A second return')",[pin],/no longer marked/)
  })

  await test("Site issues: QA completion gates still apply; completed work locks photo edits",async()=>{
    await as("issueEng")
    await expectFail("update public.pins set status='verified' where id=$1",[pin],/checklist|inspection|QA/i)
    await passWorkFixture(ctx,pin,"issueEng","issueFore")
    await as("issueEng")
    await db.query("update public.pins set status='verified' where id=$1",[pin])
    await expectFail("select public.save_site_issue_photo($1,2,'[]','Edited after completion')",[photo.id],/Reopen completed work/)
    await expectFail("select public.add_site_issue_photos($1,'[]')",[report],/Reopen completed work/)
    await expectFail("select public.log_site_issue($1,$2,'high','After completion','[]')",[randomUUID(),pin],/Reopen completed work/)
  })

  await test("Site issues: Engineer can log on a locked pin awaiting QA without losing the inspection or its evidence",async()=>{
    await as("issueEng")
    const review=(await db.query("insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values($1,$2,50,50,'QA issue work',$3) returning id",[project,sheet,ids.issueFore])).rows[0].id
    const ir=await submitWorkFixture(ctx,review,"issueEng","issueFore")
    await as("issueEng")
    await db.query("update public.pins set locked=true where id=$1",[review])
    assert.equal((await db.query("select status from public.pins where id=$1",[review])).rows[0].status,"for_review")
    const before=(await db.query("select id from public.pin_photos where pin_id=$1 order by id",[review])).rows
    await log(randomUUID(),review)
    assert.deepEqual((await db.query("select status,locked from public.pins where id=$1",[review])).rows[0],{status:"for_review",locked:true})
    assert.equal((await db.query("select count(*) n from public.site_issue_reports where pin_id=$1",[review])).rows[0].n,1)
    assert.equal((await db.query("select status from public.qa_inspections where id=$1",[ir])).rows[0].status,"requested")
    assert.deepEqual((await db.query("select id from public.pin_photos where pin_id=$1 order by id",[review])).rows,before)
    await db.query("select public.start_inspection($1)",[ir])
    await log(randomUUID(),review)
    assert.equal((await db.query("select status from public.qa_inspections where id=$1",[ir])).rows[0].status,"in_progress")
    await expectFail("update public.pins set status='in_progress' where id=$1",[review],/Awaiting Engineer inspection/)
    const item=(await db.query("select id from public.pin_checklist_items where pin_id=$1",[review])).rows[0].id
    await expectFail("update public.pin_checklist_items set text='Rewritten evidence' where id=$1",[item],/locked|pending/i)
  })
}
