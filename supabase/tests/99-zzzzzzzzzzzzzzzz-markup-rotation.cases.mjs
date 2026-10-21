import assert from "node:assert/strict"

// valid_issue_markup with the optional `rotation` (photo markup can be turned around its own centre).
export default async function ({ db, ids, as, asOwner, addUser, test, expectFail }) {
  await asOwner()
  for (const [name, role] of [["turnEng", "engineer"], ["turnFore", "foreman"]]) await addUser(name, role)
  const project = (await db.query("insert into public.projects(code,name) values('TURN-QA','Markup rotation fixture') returning id")).rows[0].id
  for (const name of ["turnEng", "turnFore"]) await db.query("insert into public.project_members(project_id,user_id) values($1,$2)", [project, ids[name]])
  const mark = { id: "box-1", kind: "rectangle", x: 10, y: 10, x2: 40, y2: 35, color: "#d93a3a", stroke: 4, fontSize: 30, text: "", points: [] }
  const valid = async value => (await db.query("select public.valid_issue_markup($1::jsonb) ok", [JSON.stringify(value)])).rows[0].ok

  await test("Markup rotation: an optional numeric rotation within one turn is accepted; marks without it stay valid", async () => {
    await as("turnEng")
    assert.equal(await valid([mark]), true, "existing 11-key marks stay valid")
    assert.equal(await valid([{ ...mark, rotation: 0 }, { ...mark, id: "box-2", rotation: -137.5 }, { ...mark, id: "text-1", kind: "text", text: "Gap", rotation: 360 }]), true)
  })

  await test("Markup rotation: out-of-range or non-numeric rotation and any other extra key are refused", async () => {
    await as("turnEng")
    assert.equal(await valid([{ ...mark, rotation: 361 }]), false)
    assert.equal(await valid([{ ...mark, rotation: -400 }]), false)
    assert.equal(await valid([{ ...mark, rotation: "45" }]), false)
    assert.equal(await valid([{ ...mark, rotation: null }]), false)
    assert.equal(await valid([{ ...mark, angle: 45 }]), false, "only rotation may be added")
    assert.equal(await valid([{ ...mark, rotation: 45, angle: 45 }]), false)
    const { stroke, ...missing } = mark
    assert.equal(await valid([{ ...missing, rotation: 45 }]), false, "rotation cannot stand in for a required key")
  })

  await test("Markup rotation: rotated marks are stored on QA evidence through the same check constraint", async () => {
    await as("turnEng")
    const ncr = (await db.query("select public.raise_defect($1,'Turned box','Check','workmanship','minor','general',null,null,$2) id", [project, ids.turnFore])).rows[0].id
    const turned = [{ ...mark, rotation: 30 }]
    await db.query("insert into public.qa_photos(project_id,defect_id,path,annotations) values($1,$2,$3,$4::jsonb)", [project, ncr, `${project}/ncr-${ncr}/turned.webp`, JSON.stringify(turned)])
    assert.deepEqual((await db.query("select annotations from public.qa_photos where defect_id=$1", [ncr])).rows[0].annotations, turned)
    await expectFail("insert into public.qa_photos(project_id,defect_id,path,annotations) values($1,$2,$3,$4::jsonb)", [project, ncr, `${project}/ncr-${ncr}/bad.webp`, JSON.stringify([{ ...mark, rotation: 720 }])], /check/)
  })
}
