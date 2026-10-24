import assert from "node:assert/strict"

// Away-from-site photos count as evidence (owner's decision, 2026-10-23); the flag and distance stay on the record.
// Only an untrusted time (phone clock ahead, older than 3 days) keeps a photo out. Synthetic criteria only.
export default async function ({ db, ids, as, asOwner, addUser, test, expectFail, count }) {
  await asOwner()
  for (const [key, role] of [["awayEng", "engineer"], ["awayFore", "foreman"]]) await addUser(key, role)
  const project = (await db.query("insert into public.projects(code,name,site_lat,site_lng) values('AWAY-PHOTO','Away photo fixture',14.5,121) returning id")).rows[0].id
  await db.query("insert into public.project_members(project_id,user_id) values($1,$2),($1,$3)", [project, ids.awayEng, ids.awayFore])
  const sheet = (await db.query("insert into public.blueprints(project_id,title) values($1,'Away plan') returning id", [project])).rows[0].id
  await as("awayEng")
  const pin = (await db.query("insert into public.pins(project_id,blueprint_id,x,y,title,assigned_to) values($1,$2,40,40,'KITCHEN',$3) returning id", [project, sheet, ids.awayFore])).rows[0].id
  const criteria = (text) => JSON.stringify([{ text, acceptance_criteria: "Synthetic passing condition", evidence_requirement: "Synthetic observation", reference: "TEST clause only" }])
  const floor = (await db.query("select public.save_work_checklist_item($1,null,'FLOOR',$2::jsonb) id", [pin, criteria("FLOOR")])).rows[0].id
  const wall = (await db.query("select public.save_work_checklist_item($1,null,'WALL',$2::jsonb) id", [pin, criteria("WALL")])).rows[0].id
  const photo = (item, name, lat, ahead = false) => db.query(
    `insert into public.pin_photos(project_id,pin_id,checklist_item_id,path,lat,lng,taken_at) values($1,$2,$3,$4,$5,121,now()${ahead ? "+interval '1 hour'" : ""}) returning *`,
    [project, pin, item, `${project}/${pin}/${name}.jpg`, lat])
  let away, ahead

  await test("Away photo: the rule keeps only untrusted times out; away, no location and unstamped photos count", async () => {
    const rows = (await db.query("select f, public.photo_eligible(f) ok from unnest(array['at_site','away_from_site','no_site_set','no_location','clock_ahead','old_photo',null]) f")).rows
    assert.deepEqual(Object.fromEntries(rows.map(r => [r.f ?? "none", r.ok])), { at_site: true, away_from_site: true, no_site_set: true, no_location: true, clock_ahead: false, old_photo: false, none: true })
  })

  await test("Away photo: a photo taken 110 km from the site is flagged but is enough to submit the item for QA", async () => {
    await as("awayFore")
    away = (await photo(floor, "away", 15.5)).rows[0]
    assert.equal(away.stamp_flag, "away_from_site")
    assert.ok(away.distance_m > 100000, "the distance stays on the record")
    await db.query("select public.submit_checklist_qa($1,$2::uuid[])", [pin, [floor]])
    assert.equal((await db.query("select review_status from public.pin_checklist_items where id=$1", [floor])).rows[0].review_status, "for_review")
  })

  await test("Away photo: a phone clock ahead still cannot satisfy the item", async () => {
    await as("awayFore")
    ahead = (await photo(wall, "ahead", 14.5, true)).rows[0]
    assert.equal(ahead.stamp_flag, "clock_ahead")
    await expectFail("select public.submit_checklist_qa($1,$2::uuid[])", [pin, [wall]], /eligible photo evidence; photos with a wrong phone clock or older than 3 days do not count/)
  })

  await test("Away photo: the Engineer can open the away photo; the wrong-time photo stays hidden from the Engineer", async () => {
    await asOwner()
    await db.query("insert into storage.objects(bucket_id,name,owner) values('pin-photos',$1,$3),('pin-photos',$2,$3)", [away.path, ahead.path, ids.awayFore])
    await as("awayEng")
    assert.equal((await db.query("select public.evidence_image_allowed('pin-photos',$1) ok", [away.path])).rows[0].ok, true)
    assert.equal(await count("select count(*) n from storage.objects where name=$1", [away.path]), 1)
    assert.equal((await db.query("select public.evidence_image_allowed('pin-photos',$1) ok", [ahead.path])).rows[0].ok, false)
    assert.equal(await count("select count(*) n from storage.objects where name=$1", [ahead.path]), 0)
  })
}
