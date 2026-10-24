import assert from "node:assert/strict"

// Pin record links (20261024090000): NCRs name their checklist item by permanent id + saved name, every NCR's pin and item
// must belong together, the legacy raise_defect entrypoint keeps working, and the assigned Foreman reports field problems
// that reach the project Engineers. Synthetic criteria only.
export default async function ({ db, ids, as, asOwner, addUser, test, expectFail, count }) {
  await asOwner()
  for (const [key, role] of [["prlEng", "engineer"], ["prlFore", "foreman"], ["prlOther", "foreman"], ["prlClient", "client"], ["prlOutEng", "engineer"]]) await addUser(key, role)
  const project = (await db.query("insert into public.projects(code,name) values('PIN-LINKS','Pin links fixture') returning id")).rows[0].id
  const other = (await db.query("insert into public.projects(code,name) values('PIN-LINKS-2','Other links fixture') returning id")).rows[0].id
  await db.query("insert into public.project_members(project_id,user_id) values($1,$2),($1,$3),($1,$4),($1,$5),($6,$7)", [project, ids.prlEng, ids.prlFore, ids.prlOther, ids.prlClient, other, ids.prlOutEng])
  const sheet = (await db.query("insert into public.blueprints(project_id,title) values($1,'Links plan') returning id", [project])).rows[0].id
  const otherSheet = (await db.query("insert into public.blueprints(project_id,title) values($1,'Other plan') returning id", [other])).rows[0].id
  await as("prlEng")
  const pin = (await db.query("insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values($1,$2,20,20,'LAUNDRY',$3) returning id", [project, sheet, ids.prlFore])).rows[0].id
  const second = (await db.query("insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values($1,$2,60,60,'KITCHEN',$3) returning id", [project, sheet, ids.prlOther])).rows[0].id
  const criteria = (text) => JSON.stringify([{ text, acceptance_criteria: "Synthetic passing condition", evidence_requirement: "Synthetic observation", reference: "TEST clause only" }])
  const floor = (await db.query("select public.save_work_checklist_item($1,null,'FLOOR',$2::jsonb) id", [pin, criteria("FLOOR")])).rows[0].id
  const wall = (await db.query("select public.save_work_checklist_item($1,null,'WALL',$2::jsonb) id", [second, criteria("WALL")])).rows[0].id
  await as("prlOutEng")
  const foreignPin = (await db.query("insert into public.pins(project_id,blueprint_id,x,y,title) values($1,$2,10,10,'FOREIGN') returning id", [other, otherSheet])).rows[0].id
  const foreignItem = (await db.query("select public.save_work_checklist_item($1,null,'FOREIGN ITEM',$2::jsonb) id", [foreignPin, criteria("FOREIGN ITEM")])).rows[0].id
  const raise = (pinId, itemId, title = "Synthetic NCR finding") => db.query(
    "select public.raise_defect(p_project=>$1,p_title=>$2,p_description=>'Synthetic',p_category=>'workmanship',p_severity=>'minor',p_trade=>'general',p_reference=>null,p_pin=>$3,p_assigned_to=>$4,p_due=>null,p_checklist_item=>$5) id",
    [project, title, pinId, ids.prlFore, itemId])
  let linked

  await test("Pin links: an NCR raised on a checklist item keeps the item id and its name; the pin is taken from the item when omitted", async () => {
    await as("prlEng")
    linked = (await raise(pin, floor)).rows[0].id
    const row = (await db.query("select pin_id,checklist_item_id,checklist_name from public.qa_defects where id=$1", [linked])).rows[0]
    assert.deepEqual(row, { pin_id: pin, checklist_item_id: floor, checklist_name: "FLOOR" })
    const inferred = (await raise(null, floor, "Item only")).rows[0].id
    assert.equal((await db.query("select pin_id from public.qa_defects where id=$1", [inferred])).rows[0].pin_id, pin)
    const projectWide = (await raise(null, null, "Project-wide finding")).rows[0].id
    assert.deepEqual((await db.query("select pin_id,checklist_item_id,checklist_name from public.qa_defects where id=$1", [projectWide])).rows[0], { pin_id: null, checklist_item_id: null, checklist_name: null })
  })

  await test("Pin links: an item from another pin or another project, or a pin from another project, is refused", async () => {
    await as("prlEng")
    await expectFail("select public.raise_defect(p_project=>$1,p_title=>'Wrong pin',p_description=>null,p_category=>'workmanship',p_severity=>'minor',p_trade=>'general',p_reference=>null,p_pin=>$2,p_assigned_to=>null,p_due=>null,p_checklist_item=>$3)", [project, pin, wall], /belonging to this work pin/)
    await expectFail("select public.raise_defect(p_project=>$1,p_title=>'Foreign item',p_description=>null,p_category=>'workmanship',p_severity=>'minor',p_trade=>'general',p_reference=>null,p_pin=>null,p_assigned_to=>null,p_due=>null,p_checklist_item=>$2)", [project, foreignItem], /belonging to this work pin/)
    await expectFail("select public.raise_defect(p_project=>$1,p_title=>'Foreign pin',p_description=>null,p_category=>'workmanship',p_severity=>'minor',p_trade=>'general',p_reference=>null,p_pin=>$2,p_assigned_to=>null,p_due=>null,p_checklist_item=>null)", [project, foreignPin], /not part of this project/)
    await asOwner()
    await expectFail("update public.qa_defects set checklist_item_id=$2 where id=$1", [linked, wall], /belonging to this work pin/)
    await expectFail("update public.qa_defects set pin_id=$2 where id=$1", [linked, foreignPin], /belonging to this work pin|not part of this project/)
    await as("prlEng")
    assert.equal((await db.query("update public.qa_defects set checklist_item_id=null where id=$1 returning id", [linked]).catch(error => ({ rows: [], error }))).rows.length, 0, "the API cannot change NCR links directly")
  })

  await test("Pin links: renaming or removing the checklist item keeps the NCR's history", async () => {
    await as("prlEng")
    await db.query("select public.save_work_checklist_item($1,$2,'FLOOR TILES',$3::jsonb)", [pin, floor, criteria("FLOOR TILES")])
    const row = (await db.query("select d.checklist_item_id,d.checklist_name,c.text from public.qa_defects d join public.pin_checklist_items c on c.id=d.checklist_item_id where d.id=$1", [linked])).rows[0]
    assert.deepEqual(row, { checklist_item_id: floor, checklist_name: "FLOOR", text: "FLOOR TILES" }, "the id link follows the rename; the saved name is what was raised")
    const spare = (await db.query("select public.save_work_checklist_item($1,null,'SKIRTING',$2::jsonb) id", [pin, criteria("SKIRTING")])).rows[0].id
    const onSpare = (await raise(pin, spare, "Skirting gap")).rows[0].id
    await db.query("delete from public.pin_checklist_items where id=$1", [spare])
    assert.deepEqual((await db.query("select checklist_item_id,checklist_name,pin_id from public.qa_defects where id=$1", [onSpare])).rows[0], { checklist_item_id: null, checklist_name: "SKIRTING", pin_id: pin })
  })

  await test("Pin links: the legacy 10-argument raise_defect still works and a client report keeps its pin on the NCR", async () => {
    await as("prlEng")
    const legacy = (await db.query("select public.raise_defect($1,'Legacy call',null,'workmanship','minor','general',null,$2,null,null) id", [project, second])).rows[0].id
    assert.deepEqual((await db.query("select pin_id,checklist_item_id from public.qa_defects where id=$1", [legacy])).rows[0], { pin_id: second, checklist_item_id: null })
    await as("prlClient")
    const snag = (await db.query("select public.submit_linked_snag($1,'Crack near the door','Synthetic',null,'normal',$2) id", [project, second])).rows[0].id
    await as("prlEng")
    const defect = (await db.query("select public.decide_snag($1,true,'Accepted for test','minor','workmanship','general',null,null,null) id", [snag])).rows[0].id
    assert.equal((await db.query("select pin_id from public.qa_defects where id=$1", [defect])).rows[0].pin_id, second)
    assert.equal((await db.query("select pin_id from public.client_snags where id=$1", [snag])).rows[0].pin_id, second, "the original client report keeps its pin")
    await as("prlClient")
    assert.equal(await count("select count(*) n from public.qa_defects where project_id=$1", [project]), 0, "clients never read NCRs")
  })

  await test("Field problems: the assigned Foreman reports one on the pin timeline and every project Engineer is notified", async () => {
    await as("prlFore")
    await db.query("select public.report_field_problem($1,$2,'Tiles delivered cracked, cannot continue')", [pin, floor])
    const event = (await db.query("select actor_id,kind,note from public.pin_events where pin_id=$1 and note like 'Field problem:%' order by id desc limit 1", [pin])).rows[0]
    assert.deepEqual(event, { actor_id: ids.prlFore, kind: "comment", note: "Field problem: [FLOOR TILES] Tiles delivered cracked, cannot continue" })
    await as("prlEng")
    const note = (await db.query("select kind,link,entity_id from public.notifications where user_id=$1 and kind='pin.problem' order by created_at desc limit 1", [ids.prlEng])).rows[0]
    assert.equal(note.entity_id, pin)
    assert.equal(note.link, `/engineer/annotation?project=${project}&sheet=${sheet}&pin=${pin}&pintab=activity`)
    await as("prlOutEng")
    assert.equal(await count("select count(*) n from public.notifications where kind='pin.problem' and user_id=$1", [ids.prlOutEng]), 0, "Engineers of other projects are not told")
  })

  await test("Field problems: only the assigned Foreman, with a real description and an item of the same pin", async () => {
    await as("prlOther")
    await expectFail("select public.report_field_problem($1,null,'Not my work but reporting')", [pin], /Only the Foreman assigned/)
    await as("prlEng")
    await expectFail("select public.report_field_problem($1,null,'Engineer should log an issue instead')", [pin], /Only the Foreman assigned/)
    await as("prlClient")
    await expectFail("select public.report_field_problem($1,null,'Client should report a problem instead')", [pin], /Only the Foreman assigned/)
    await as("prlFore")
    await expectFail("select public.report_field_problem($1,null,'bad')", [pin], /5 to 1000/)
    await expectFail("select public.report_field_problem($1,$2,'Item from another pin')", [pin, wall], /belonging to this work pin/)
  })
}
