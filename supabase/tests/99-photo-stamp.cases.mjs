// Tests for 0039: site location on projects, and the time / place stamp the database checks on pin and QA photos.
export default async function ({ db, ids, as, asOwner, test, expectFail, count }) {
  await asOwner()
  const project = (await db.query("insert into public.projects (code, name, status, site_lat, site_lng, site_radius_m) values ('STAMP-1', 'Stamp tower', 'active', 14.676000, 120.983000, 150) returning id")).rows[0].id
  const bare = (await db.query("insert into public.projects (code, name, status) values ('STAMP-2', 'No site yet', 'active') returning id")).rows[0].id
  await db.query("insert into public.project_members (project_id, user_id) values ($1, $2), ($1, $3), ($4, $2), ($4, $3)", [project, ids.eng1, ids.fore1, bare])
  const sheet = (await db.query("insert into public.blueprints (project_id, title) values ($1, 'Stamp plan') returning id", [project])).rows[0].id
  const sheet2 = (await db.query("insert into public.blueprints (project_id, title) values ($1, 'Plan 2') returning id", [bare])).rows[0].id
  const pin = (await db.query("insert into public.pins (project_id, blueprint_id, x, y, title, assigned_to) values ($1, $2, 5, 5, 'Stamped pin', $3) returning id", [project, sheet, ids.fore1])).rows[0].id
  const pin2 = (await db.query("insert into public.pins (project_id, blueprint_id, x, y, title, assigned_to) values ($1, $2, 5, 5, 'Pin without a site', $3) returning id", [bare, sheet2, ids.fore1])).rows[0].id
  let n = 0
  const photo = async (over = {}, forPin = pin, forProject = project) => {
    await as("fore1")
    const row = { lat: null, lng: null, accuracy: null, taken: null, flag: null, dist: null, ...over }
    n++
    return (
      await db.query(
        "insert into public.pin_photos (pin_id, project_id, path, lat, lng, accuracy_m, taken_at, stamp_flag, distance_m) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning stamp_flag, distance_m, taken_at, lat",
        [forPin, forProject, `${forProject}/${forPin}/s${n}.jpg`, row.lat, row.lng, row.accuracy, row.taken, row.flag, row.dist],
      )
    ).rows[0]
  }

  await test("Distance maths: 0.001 degree of latitude is about 111 m, zero for the same point", async () => {
    await asOwner()
    const near = Number((await db.query("select public.distance_m(14.676, 120.983, 14.677, 120.983) d")).rows[0].d)
    if (near < 109 || near > 113) throw new Error("111 m expected, got " + near)
    if (Number((await db.query("select public.distance_m(14.676, 120.983, 14.676, 120.983) d")).rows[0].d) !== 0) throw new Error("same point should be 0")
    const far = Number((await db.query("select public.distance_m(14.6760, 120.9830, 14.5995, 120.9842) d")).rows[0].d)
    if (far < 8400 || far > 8700) throw new Error("Valenzuela to Manila centre is about 8.5 km, got " + far)
  })

  await test("A photo at the site is flagged at_site with its distance", async () => {
    const row = await photo({ lat: 14.676, lng: 120.983, accuracy: 12 })
    if (row.stamp_flag !== "at_site" || row.distance_m !== 0) throw new Error(JSON.stringify(row))
  })

  await test("A photo 220 m away is away_from_site, unless the GPS reading was so poor (100 m) that it could still be inside", async () => {
    const far = await photo({ lat: 14.678, lng: 120.983, accuracy: 10 })
    if (far.stamp_flag !== "away_from_site" || far.distance_m < 215 || far.distance_m > 228) throw new Error(JSON.stringify(far))
    const fuzzy = await photo({ lat: 14.678, lng: 120.983, accuracy: 100 })
    if (fuzzy.stamp_flag !== "at_site") throw new Error("a 100 m reading is forgiven up to its accuracy: " + JSON.stringify(fuzzy))
    const hopeless = await photo({ lat: 14.7, lng: 120.983, accuracy: 5000 })
    if (hopeless.stamp_flag !== "away_from_site") throw new Error("forgiveness is capped at 100 m: " + JSON.stringify(hopeless))
  })

  await test("No position -> no_location; a position on a project without a site -> no_site_set", async () => {
    if ((await photo({})).stamp_flag !== "no_location") throw new Error("no position")
    const bareRow = await photo({ lat: 14.676, lng: 120.983 }, pin2, bare)
    if (bareRow.stamp_flag !== "no_site_set" || bareRow.distance_m !== null) throw new Error(JSON.stringify(bareRow))
  })

  await test("Clock tricks are flagged: a phone clock ahead, an old picture re-uploaded; a photo taken offline a few hours ago is normal", async () => {
    await asOwner()
    const hours = (await db.query("select now() - interval '5 hours' t")).rows[0].t
    const ahead = (await db.query("select now() + interval '1 hour' t")).rows[0].t
    const old = (await db.query("select now() - interval '4 days' t")).rows[0].t
    if ((await photo({ lat: 14.676, lng: 120.983, taken: hours })).stamp_flag !== "at_site") throw new Error("offline photo wrongly flagged")
    if ((await photo({ lat: 14.676, lng: 120.983, taken: ahead })).stamp_flag !== "clock_ahead") throw new Error("clock ahead")
    if ((await photo({ lat: 14.676, lng: 120.983, taken: old })).stamp_flag !== "old_photo") throw new Error("old photo")
  })

  await test("The browser cannot choose its own flag or distance (they are computed here)", async () => {
    const row = await photo({ lat: 14.7, lng: 120.983, accuracy: 5, flag: "at_site", dist: 0 })
    if (row.stamp_flag !== "away_from_site" || row.distance_m < 2500) throw new Error("spoofed flag survived: " + JSON.stringify(row))
  })

  await test("Bad coordinates and half a position are refused; stamped rows can never be edited", async () => {
    await as("fore1")
    await expectFail("insert into public.pin_photos (pin_id, project_id, path, lat, lng) values ($1, $2, $3, 95, 10)", [pin, project, `${project}/${pin}/bad1.jpg`], /check constraint/)
    await expectFail("insert into public.pin_photos (pin_id, project_id, path, lat) values ($1, $2, $3, 14.6)", [pin, project, `${project}/${pin}/bad2.jpg`], /check constraint/)
    const upd = await db.query("update public.pin_photos set stamp_flag = 'at_site', distance_m = 0 where pin_id = $1 returning id", [pin])
    if (upd.rows.length) throw new Error("a stamped photo was edited")
  })

  await test("Only the Super Admin / admins who manage projects can set the site; engineers and foremen cannot move it", async () => {
    await as("fore1", "aal2")
    const none = await db.query("update public.projects set site_lat = 1, site_lng = 1 where id = $1 returning id", [project])
    if (none.rows.length) throw new Error("foreman moved the site")
    await as("eng1", "aal2")
    const eng = await db.query("update public.projects set site_radius_m = 5000 where id = $1 returning id", [project])
    if (eng.rows.length) throw new Error("engineer moved the site")
    await as("super", "aal2")
    await db.query("update public.projects set site_radius_m = 300 where id = $1", [project])
    await expectFail("update public.projects set site_lat = null where id = $1", [project], /projects_site_both/)
    await expectFail("update public.projects set site_radius_m = 5 where id = $1", [project], /check constraint/)
    await db.query("update public.projects set site_radius_m = 150 where id = $1", [project])
  })

  await test("QA evidence photos get the same stamp", async () => {
    await asOwner()
    // a project of its own (engineer only), so the evidence counts of the QA tests are untouched
    const qaProject = (await db.query("insert into public.projects (code, name, status, site_lat, site_lng) values ('STAMP-3', 'QA stamp tower', 'active', 14.676, 120.983) returning id")).rows[0].id
    await db.query("insert into public.project_members (project_id, user_id) values ($1, $2)", [qaProject, ids.eng1])
    const tpl = (await db.query("select id from public.qa_templates where is_system order by name limit 1")).rows[0].id
    await as("eng1", "aal2")
    const ir = (await db.query("select public.request_inspection($1, $2, 'Stamp inspection') id", [qaProject, tpl])).rows[0].id
    await db.query("select public.start_inspection($1)", [ir])
    const at = (await db.query("insert into public.qa_photos (project_id, inspection_id, path, lat, lng, accuracy_m) values ($1, $2, $3, 14.676, 120.983, 8) returning stamp_flag", [qaProject, ir, `${qaProject}/ir/stamp-a.jpg`])).rows[0]
    const away = (await db.query("insert into public.qa_photos (project_id, inspection_id, path, lat, lng, accuracy_m) values ($1, $2, $3, 14.70, 120.983, 8) returning stamp_flag, distance_m", [qaProject, ir, `${qaProject}/ir/stamp-b.jpg`])).rows[0]
    await expectFail("insert into public.qa_photos (project_id, inspection_id, path, stamp_flag) values ($1, $2, $3, 'at_site')", [qaProject, ir, `${qaProject}/ir/stamp-d.jpg`], /permission denied/)
    const none = (await db.query("insert into public.qa_photos (project_id, inspection_id, path) values ($1, $2, $3) returning stamp_flag", [qaProject, ir, `${qaProject}/ir/stamp-c.jpg`])).rows[0]
    if (at.stamp_flag !== "at_site" || away.stamp_flag !== "away_from_site" || none.stamp_flag !== "no_location") throw new Error(JSON.stringify([at, away, none]))
    await asOwner()
    if ((await count("select count(*) n from public.qa_photos where project_id = $1 and stamp_flag is not null", [qaProject])) !== 3) throw new Error("every QA photo should carry a flag")
  })
}
