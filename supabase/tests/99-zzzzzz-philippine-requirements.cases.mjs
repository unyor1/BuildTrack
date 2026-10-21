import assert from "node:assert/strict"

// Synthetic criteria only: these tests do not invent limits or clauses for a real standard.
export default async function ({ db, ids, as, asOwner, addUser, test, expectFail }) {
  await asOwner()
  await addUser("criteriaEng", "engineer")
  await addUser("criteriaFore", "foreman")
  const project = (await db.query("insert into public.projects(code,name) values('QA-CRITERIA','Synthetic requirements test') returning id")).rows[0].id
  await db.query("insert into public.project_members(project_id,user_id) values($1,$2),($1,$3)", [project, ids.criteriaEng, ids.criteriaFore])
  const criterion = { text: "Synthetic receiving check", severity: "critical", reference: "TEST 2026, clause TEST", acceptance_criteria: "Synthetic Engineer-defined pass criterion", evidence_requirement: "Synthetic batch certificate and laboratory report" }
  const save = (id, items) => db.query("select public.save_qa_template($1,$2,'Synthetic criteria checklist','general',null,array['TEST 2026'],$3::jsonb) id", [id, project, JSON.stringify(items)])
  let template, inspection, copy

  await test("QA requirements: Engineer saves explicit criteria and tests; Foreman cannot edit them", async () => {
    await as("criteriaFore")
    await expectFail("select public.save_qa_template(null,$1,'Forbidden criteria','general',null,'{}',$2::jsonb)", [project, JSON.stringify([criterion])], /engineer/)
    await as("criteriaEng")
    template = (await save(null, [criterion])).rows[0].id
    const row = (await db.query("select * from public.qa_template_items where template_id=$1", [template])).rows[0]
    assert.equal(row.reference, criterion.reference)
    assert.equal(row.acceptance_criteria, criterion.acceptance_criteria)
    assert.equal(row.evidence_requirement, criterion.evidence_requirement)
    await expectFail("update public.qa_template_items set acceptance_criteria='tampered' where template_id=$1", [template], /permission denied/)
  })

  await test("QA requirements: copying a project checklist retains the standard, criteria and tests", async () => {
    await as("criteriaEng")
    copy = (await db.query("select public.duplicate_qa_template($1,$2,'Synthetic copy') id", [template, project])).rows[0].id
    const row = (await db.query("select * from public.qa_template_items where template_id=$1", [copy])).rows[0]
    assert.equal(row.acceptance_criteria, criterion.acceptance_criteria)
    assert.equal(row.evidence_requirement, criterion.evidence_requirement)
  })

  await test("QA requirements: inspection snapshots survive subsequent template edits", async () => {
    await as("criteriaFore")
    inspection = (await db.query("select public.request_inspection($1,$2,'Synthetic receiving inspection') id", [project, template])).rows[0].id
    await as("criteriaEng")
    await save(template, [{ ...criterion, acceptance_criteria: "Changed for future inspections", evidence_requirement: "Future test instructions" }])
    const row = (await db.query("select * from public.qa_inspection_items where inspection_id=$1", [inspection])).rows[0]
    assert.equal(row.reference, criterion.reference)
    assert.equal(row.acceptance_criteria, criterion.acceptance_criteria)
    assert.equal(row.evidence_requirement, criterion.evidence_requirement)
    await expectFail("update public.qa_inspection_items set evidence_requirement='tampered' where inspection_id=$1", [inspection], /permission denied/)
  })

  await test("QA requirements: failed stage re-inspection keeps the original frozen criteria, not the edited template", async () => {
    await as("criteriaEng")
    await db.query("select public.start_inspection($1)", [inspection])
    const item = (await db.query("select id from public.qa_inspection_items where inspection_id=$1", [inspection])).rows[0].id
    await db.query("select public.save_inspection_item($1,'fail',null,'Synthetic nonconformance')", [item])
    await db.query("select public.complete_inspection($1,'Synthetic failed check')", [inspection])
    await as("criteriaFore")
    const next = (await db.query("select public.request_reinspection($1,'Synthetic correction ready') id", [inspection])).rows[0].id
    const row = (await db.query("select * from public.qa_inspection_items where inspection_id=$1", [next])).rows[0]
    assert.equal(row.acceptance_criteria, criterion.acceptance_criteria)
    assert.equal(row.evidence_requirement, criterion.evidence_requirement)
  })

  await test("QA requirements: length limits enforced in the database; old payloads remain compatible", async () => {
    await as("criteriaEng")
    for (const field of ["acceptance_criteria", "evidence_requirement"]) {
      await expectFail("select public.save_qa_template(null,$1,'Too long criteria','general',null,'{}',$2::jsonb)", [project, JSON.stringify([{ ...criterion, [field]: "x".repeat(1001) }])], /check constraint/)
    }
    const legacy = (await save(null, [{ text: "Legacy synthetic criterion" }])).rows[0].id
    const row = (await db.query("select * from public.qa_template_items where template_id=$1", [legacy])).rows[0]
    assert.equal(row.acceptance_criteria, null)
    assert.equal(row.evidence_requirement, null)
    await as("criteriaFore")
    await expectFail("select public.request_stage_inspection($1,$2,'Bypass wrapper')", [project, copy], /permission denied/)
  })
}
