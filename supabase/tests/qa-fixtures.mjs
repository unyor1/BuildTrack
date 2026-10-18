// Older verification/evidence tests now exercise a real 0042 submission and Engineer inspection.
// Criteria here are synthetic test data only, never production templates or standards.
export async function submitWorkFixture({ db, ids, as, asOwner }, pin, engineer = "eng1", foreman = "fore1") {
  await asOwner()
  const pn = (await db.query("select * from public.pins where id=$1", [pin])).rows[0]
  const template = (await db.query("insert into public.qa_templates(project_id,name,trade) values($1,'Test-only inspection criteria','general') returning id", [pn.project_id])).rows[0].id
  await db.query("insert into public.qa_template_items(template_id,position,text) values($1,0,'Synthetic test observation')", [template])
  await as(engineer, "aal2")
  await db.query("select public.approve_pin_qa_checklist($1,$2)", [pin,template])
  await db.query("update public.pins set status='in_progress',assigned_to=$2 where id=$1", [pin,ids[foreman]])
  if (!(await db.query("select id from public.pin_checklist_items where pin_id=$1", [pin])).rows.length)
    await db.query("insert into public.pin_checklist_items(pin_id,project_id,text) values($1,$2,'Synthetic work step')", [pin,pn.project_id])
  const items = (await db.query("select id,done from public.pin_checklist_items where pin_id=$1", [pin])).rows
  await as(foreman, "aal2")
  await db.query("select public.select_pin_qa_checklist($1,$2)", [pin,template])
  for (const item of items) {
    if (!(await db.query("select id from public.pin_photos where checklist_item_id=$1", [item.id])).rows.length)
      await db.query("insert into public.pin_photos(pin_id,project_id,checklist_item_id,path) values($1,$2,$3,$4)", [pin,pn.project_id,item.id,`${pn.project_id}/${pin}/${item.id}.jpg`])
    if (!item.done) await db.query("update public.pin_checklist_items set done=true where id=$1", [item.id])
  }
  return (await db.query("select public.submit_pin_qa($1) id", [pin])).rows[0].id
}

export async function passWorkFixture(ctx, pin, engineer = "eng1", foreman = "fore1") {
  const ir = await submitWorkFixture(ctx,pin,engineer,foreman)
  await ctx.as(engineer,"aal2")
  await ctx.db.query("select public.start_inspection($1)",[ir])
  const items=(await ctx.db.query("select id from public.qa_inspection_items where inspection_id=$1",[ir])).rows
  for (const item of items) await ctx.db.query("select public.save_inspection_item($1,'pass',null,null)",[item.id])
  await ctx.db.query("select public.complete_inspection($1,'Test-only inspection completed')",[ir])
  return ir
}
