import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

export default async function({db,ids,as,asOwner,addUser,test,expectFail}) {
  await asOwner()
  await addUser("filterEng","engineer")
  await addUser("filterFore","foreman")
  const project=(await db.query("insert into public.projects(code,name) values('ISSUE-ITEM','Issue checklist filter') returning id")).rows[0].id
  const other=(await db.query("insert into public.projects(code,name) values('ISSUE-ITEM-OTHER','Other issue checklist filter') returning id")).rows[0].id
  await db.query("insert into public.project_members(project_id,user_id) values($1,$2),($1,$3),($4,$2)",[project,ids.filterEng,ids.filterFore,other])
  await as("filterEng")
  const bp=(await db.query("insert into public.blueprints(project_id,title) values($1,'Checklist zone') returning id",[project])).rows[0].id
  const otherBp=(await db.query("insert into public.blueprints(project_id,title) values($1,'Other checklist zone') returning id",[other])).rows[0].id
  const pin=(await db.query("insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values($1,$2,10,10,'KITCHEN',$3) returning id",[project,bp,ids.filterFore])).rows[0].id
  const second=(await db.query("insert into public.pins(project_id,blueprint_id,x,y,title) values($1,$2,20,20,'LAUNDRY') returning id",[project,bp])).rows[0].id
  const foreign=(await db.query("insert into public.pins(project_id,blueprint_id,x,y,title) values($1,$2,30,30,'OTHER PROJECT') returning id",[other,otherBp])).rows[0].id
  const item=async(pinId,pid,text)=>(await db.query("insert into public.pin_checklist_items(pin_id,project_id,text) values($1,$2,$3) returning id",[pinId,pid,text])).rows[0].id
  const floor=await item(pin,project,"FLOOR")
  const otherFloor=await item(second,project,"FLOOR")
  const foreignFloor=await item(foreign,other,"FLOOR")
  const report=randomUUID()
  const linkedSql="select public.log_site_issue($1,$2,'medium','Synthetic linked checklist issue','[]'::jsonb,$3) id"

  await test("Issue checklist: Engineer records the exact item ID and original name; Foreman reads the same link",async()=>{
    await as("filterEng")
    await db.query(linkedSql,[report,pin,floor])
    const row=(await db.query("select * from public.site_issue_reports where id=$1",[report])).rows[0]
    assert.equal(row.checklist_item_id,floor)
    assert.equal(row.checklist_name,"FLOOR")
    assert.equal(row.pin_id,pin)
    const event=(await db.query("select note from public.pin_events where pin_id=$1 and kind='comment' order by id desc limit 1",[pin])).rows[0]
    assert.equal(event.note,"Issue: [FLOOR] Synthetic linked checklist issue")
    await as("filterFore")
    assert.equal((await db.query("select checklist_name from public.site_issue_reports where id=$1",[report])).rows[0].checklist_name,"FLOOR")
    await expectFail(linkedSql,[randomUUID(),pin,floor],/Only the project Engineer/)
  })

  await test("Issue checklist: another pin/project's item and missing IDs are refused atomically",async()=>{
    await as("filterEng")
    const before=(await db.query("select count(*) n from public.site_issue_reports")).rows[0].n
    for(const invalid of [floor,foreignFloor,randomUUID()]) {
      await expectFail(linkedSql,[randomUUID(),second,invalid],/belonging to this work pin/)
      assert.equal((await db.query("select status from public.pins where id=$1",[second])).rows[0].status,"not_started")
      assert.equal((await db.query("select count(*) n from public.site_issue_reports")).rows[0].n,before)
    }
  })

  await test("Issue checklist: retries remain idempotent; legacy five-argument and new whole-pin requests stay compatible",async()=>{
    await as("filterEng")
    await db.query(linkedSql,[report,pin,floor])
    assert.equal((await db.query("select count(*) n from public.site_issue_reports where id=$1",[report])).rows[0].n,1)
    const legacy=randomUUID(), whole=randomUUID()
    await db.query("select public.log_site_issue($1,$2,'low','Legacy whole pin issue','[]')",[legacy,second])
    await db.query(linkedSql,[whole,second,null])
    const rows=(await db.query("select * from public.site_issue_reports where id in ($1,$2)",[legacy,whole])).rows
    assert.equal(rows.length,2)
    for(const row of rows){assert.equal(row.checklist_item_id,null);assert.equal(row.checklist_name,null)}
    assert.equal((await db.query("select checklist_item_id from public.site_issue_reports where id=$1",[report])).rows[0].checklist_item_id,floor)
    assert.equal((await db.query("select has_function_privilege('anon','public.log_site_issue(uuid,uuid,text,text,jsonb,uuid)','EXECUTE') ok")).rows[0].ok,false)
  })

  await test("Issue checklist: later rename/deletion keeps the original name and does not delete issue/photos/history",async()=>{
    await as("filterEng")
    await db.query("update public.pin_checklist_items set text='RENAMED FLOOR' where id=$1",[floor])
    assert.equal((await db.query("select checklist_name from public.site_issue_reports where id=$1",[report])).rows[0].checklist_name,"FLOOR")
    await db.query("delete from public.pin_checklist_items where id=$1",[floor])
    const row=(await db.query("select * from public.site_issue_reports where id=$1",[report])).rows[0]
    assert.equal(row.checklist_item_id,null)
    assert.equal(row.checklist_name,"FLOOR")
    assert.equal((await db.query("select count(*) n from public.pin_checklist_items where id=$1",[otherFloor])).rows[0].n,1)
    await expectFail("update public.site_issue_reports set checklist_name='TAMPERED' where id=$1",[report],/permission denied/)
  })
}
