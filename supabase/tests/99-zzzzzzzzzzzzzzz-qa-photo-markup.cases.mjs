import assert from "node:assert/strict"

// qa_photos.annotations: inspection and NCR evidence keeps the original file and stores validated markup beside it.
export default async function ({ db, ids, as, asOwner, addUser, test, expectFail }) {
  await asOwner()
  for (const [name, role] of [["markEng", "engineer"], ["markFore", "foreman"], ["markClient", "client"], ["markOutsider", "engineer"]]) await addUser(name, role)
  const project = (await db.query("insert into public.projects(code,name) values('MARKUP-QA','QA photo markup fixture') returning id")).rows[0].id
  for (const name of ["markEng", "markFore", "markClient"]) await db.query("insert into public.project_members(project_id,user_id) values($1,$2)", [project, ids[name]])
  const template = (await db.query("insert into public.qa_templates(project_id,name,trade) values($1,'Test-only markup criteria','general') returning id", [project])).rows[0].id
  await db.query("insert into public.qa_template_items(template_id,position,text) values($1,0,'Synthetic observation')", [template])
  const markup = [
    { id: "arrow-1", kind: "arrow", x: 10, y: 10, x2: 40, y2: 35, color: "#d93a3a", stroke: 4, fontSize: 30, text: "", points: [] },
    { id: "note-1", kind: "text", x: 45, y: 40, x2: 45, y2: 40, color: "#ffffff", stroke: 4, fontSize: 24, text: "Gap at the joint", points: [] },
  ]
  let item, photo

  await test("QA photo markup: an inspection photo keeps its original path and stores validated markup separately", async () => {
    await as("markFore")
    const ir = (await db.query("select public.request_inspection($1,$2,'Markup stage check') id", [project, template])).rows[0].id
    await as("markEng")
    await db.query("select public.start_inspection($1)", [ir])
    item = (await db.query("select id from public.qa_inspection_items where inspection_id=$1", [ir])).rows[0].id
    const path = `${project}/item-${item}/original.webp`
    photo = (await db.query("insert into public.qa_photos(project_id,item_id,path,caption,annotations) values($1,$2,$3,'Joint gap marked',$4::jsonb) returning id", [project, item, path, JSON.stringify(markup)])).rows[0].id
    const row = (await db.query("select path,caption,annotations,uploaded_by from public.qa_photos where id=$1", [photo])).rows[0]
    assert.equal(row.path, path); assert.equal(row.caption, "Joint gap marked"); assert.deepEqual(row.annotations, markup); assert.equal(row.uploaded_by, ids.markEng)
    const plain = (await db.query("insert into public.qa_photos(project_id,item_id,path) values($1,$2,$3) returning annotations", [project, item, `${project}/item-${item}/plain.webp`])).rows[0]
    assert.deepEqual(plain.annotations, [])
  })

  await test("QA photo markup: malformed markup is refused and saved markup cannot be changed afterwards", async () => {
    await as("markEng")
    await expectFail("insert into public.qa_photos(project_id,item_id,path,annotations) values($1,$2,$3,'[{\"kind\":\"script\"}]')", [project, item, `${project}/item-${item}/bad.webp`], /check/)
    await expectFail("insert into public.qa_photos(project_id,item_id,path,annotations) values($1,$2,$3,$4::jsonb)", [project, item, `${project}/item-${item}/outside.webp`, JSON.stringify([{ ...markup[0], x2: 140 }])], /check/)
    await expectFail("update public.qa_photos set annotations='[]' where id=$1", [photo], /permission denied/)
    assert.deepEqual((await db.query("select annotations from public.qa_photos where id=$1", [photo])).rows[0].annotations, markup)
  })

  await test("QA photo markup: NCR evidence takes markup too; clients and other projects never read it", async () => {
    await as("markEng")
    const ncr = (await db.query("select public.raise_defect($1,'Gap at the joint','Seal it','workmanship','minor','general',null,null,$2) id", [project, ids.markFore])).rows[0].id
    await db.query("insert into public.qa_photos(project_id,defect_id,path,annotations) values($1,$2,$3,$4::jsonb)", [project, ncr, `${project}/ncr-${ncr}/found.webp`, JSON.stringify(markup)])
    await as("markFore")
    assert.deepEqual((await db.query("select annotations from public.qa_photos where defect_id=$1", [ncr])).rows[0].annotations, markup)
    await as("markClient")
    assert.equal((await db.query("select * from public.qa_photos where project_id=$1", [project])).rows.length, 0)
    await as("markOutsider")
    assert.equal((await db.query("select * from public.qa_photos where project_id=$1", [project])).rows.length, 0)
  })
}
