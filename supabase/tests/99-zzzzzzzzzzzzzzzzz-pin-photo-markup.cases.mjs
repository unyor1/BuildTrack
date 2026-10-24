import assert from "node:assert/strict"

// pin_photos.annotations: work item / correction photos keep the original file and store validated markup beside it; the
// QA submission snapshot carries the markup. Synthetic criteria only.
export default async function ({ db, ids, as, asOwner, addUser, test, expectFail }) {
  await asOwner()
  for (const [key, role] of [["pinMarkEng", "engineer"], ["pinMarkFore", "foreman"]]) await addUser(key, role)
  const project = (await db.query("insert into public.projects(code,name,site_lat,site_lng) values('PIN-MARKUP','Pin photo markup fixture',14.5,121) returning id")).rows[0].id
  await db.query("insert into public.project_members(project_id,user_id) values($1,$2),($1,$3)", [project, ids.pinMarkEng, ids.pinMarkFore])
  const sheet = (await db.query("insert into public.blueprints(project_id,title) values($1,'Markup plan') returning id", [project])).rows[0].id
  await as("pinMarkEng")
  const pin = (await db.query("insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values($1,$2,30,30,'LAUNDRY',$3) returning id", [project, sheet, ids.pinMarkFore])).rows[0].id
  const criteria = [{ text: "FLOOR", acceptance_criteria: "Synthetic passing condition", evidence_requirement: "Synthetic observation", reference: "TEST clause only" }]
  const item = (await db.query("select public.save_work_checklist_item($1,null,'FLOOR',$2::jsonb) id", [pin, JSON.stringify(criteria)])).rows[0].id
  const markup = [
    { id: "gap-arrow", kind: "arrow", x: 10, y: 10, x2: 40, y2: 35, color: "#d93a3a", stroke: 4, fontSize: 30, text: "", points: [] },
    { id: "gap-note", kind: "text", x: 45, y: 40, x2: 45, y2: 40, color: "#ffffff", stroke: 4, fontSize: 24, text: "Fixed joint", points: [], rotation: 15 },
  ]
  const insert = (path, annotations) => db.query("insert into public.pin_photos(project_id,pin_id,checklist_item_id,path,lat,lng,taken_at,caption,annotations) values($1,$2,$3,$4,14.5,121,now(),'Joint after the fix',$5::jsonb) returning id,annotations", [project, pin, item, `${project}/${pin}/${path}.jpg`, JSON.stringify(annotations)])
  let photo

  await test("Pin photo markup: the Foreman's checklist photo keeps its file and stores validated markup; plain photos get []", async () => {
    await as("pinMarkFore")
    const row = (await insert("marked", markup)).rows[0]
    photo = row.id
    assert.deepEqual(row.annotations, markup)
    const plain = (await db.query("insert into public.pin_photos(project_id,pin_id,checklist_item_id,path,lat,lng,taken_at) values($1,$2,$3,$4,14.5,121,now()) returning annotations", [project, pin, item, `${project}/${pin}/plain.jpg`])).rows[0]
    assert.deepEqual(plain.annotations, [])
  })

  await test("Pin photo markup: malformed markup is refused and saved markup cannot be changed", async () => {
    await as("pinMarkFore")
    await expectFail("insert into public.pin_photos(project_id,pin_id,checklist_item_id,path,annotations) values($1,$2,$3,$4,'[{\"kind\":\"script\"}]')", [project, pin, item, `${project}/${pin}/bad.jpg`], /check/)
    await expectFail("insert into public.pin_photos(project_id,pin_id,checklist_item_id,path,annotations) values($1,$2,$3,$4,$5::jsonb)", [project, pin, item, `${project}/${pin}/turned.jpg`, JSON.stringify([{ ...markup[0], rotation: 720 }])], /check/)
    assert.equal((await db.query("update public.pin_photos set annotations='[]' where id=$1 returning id", [photo])).rows.length, 0, "no update policy: markup is fixed")
    await as("pinMarkEng")
    assert.equal((await db.query("update public.pin_photos set annotations='[]' where id=$1 returning id", [photo])).rows.length, 0)
    assert.deepEqual((await db.query("select annotations from public.pin_photos where id=$1", [photo])).rows[0].annotations, markup, "the Engineer reads the Foreman's markup")
  })

  await test("Pin photo markup: the QA submission snapshot keeps the markup with the photo", async () => {
    await as("pinMarkFore")
    await db.query("select public.submit_checklist_qa($1,$2::uuid[])", [pin, [item]])
    await as("pinMarkEng")
    const snapshot = (await db.query("select photos_snapshot from public.pin_qa_submissions where pin_id=$1 order by submitted_at desc limit 1", [pin])).rows[0].photos_snapshot
    assert.deepEqual(snapshot.find(entry => entry.id === photo).annotations, markup)
  })
}
