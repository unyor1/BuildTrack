// Tests for 0014: annotations (notes / shapes), pin checklist, sheet scale, revision thumbnails.
export default async function ({ db, ids, as, asOwner, test, expectOk, expectFail, count }) {
  const P1 = ids.p1
  const OTHER = ids.other

  await as("eng1", "aal2")
  const bp = (await db.query("insert into public.blueprints (project_id, title) values ($1, 'Editor plan') returning id", [P1])).rows[0].id
  const pin = (await db.query("insert into public.pins (project_id, blueprint_id, x, y, title) values ($1, $2, 30, 30, 'Checklist pin') returning id", [P1, bp])).rows[0].id

  const noteSql = "insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, text, color) values ($1, $2, 'note', 20, 20, $3, 'blue') returning id"
  const shapeSql = "insert into public.blueprint_annotations (project_id, blueprint_id, kind, shape, x, y, w, h, text, color) values ($1, $2, 'shape', $3, $4, $5, $6, $7, 'Slab pour zone', 'orange') returning id"

  // ---- Annotations ----
  await test("Engineer adds a note and shapes; creator and project are set by the database", async () => {
    await as("eng1", "aal2")
    ids.note = (await db.query(noteSql, [OTHER, bp, "Check beam depth"])).rows[0].id // lies about project_id
    ids.rect = (await db.query(shapeSql, [P1, bp, "rect", 10, 10, 30, 20])).rows[0].id
    ids.oval = (await db.query(shapeSql, [P1, bp, "ellipse", 50, 50, 20, 20])).rows[0].id
    await asOwner()
    const { rows } = await db.query("select project_id, created_by from public.blueprint_annotations where id = $1", [ids.note])
    if (rows[0].project_id !== P1 || rows[0].created_by !== ids.eng1) throw new Error("project/creator not set by the database")
  })

  await test("Invalid annotations are rejected (shape without size, note with a shape, empty note, out of bounds, bad color)", async () => {
    await as("eng1", "aal2")
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, shape, x, y, color) values ($1, $2, 'shape', 'rect', 10, 10, 'red')", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, shape, x, y, w, h, text) values ($1, $2, 'note', 'rect', 10, 10, 5, 5, 'x')", [P1, bp], /check constraint/)
    await expectFail(noteSql, [P1, bp, "   "], /check constraint/)
    await expectFail(shapeSql, [P1, bp, "rect", 80, 80, 30, 30], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, text, color) values ($1, $2, 'note', 10, 10, 'hello', 'pink')", [P1, bp], /color_check/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, text) values ($1, $2, 'note', 101, 10, 'hello')", [P1, bp], /x_check/)
  })

  await test("Foreman, Client, outsiders, pending users and anonymous cannot add annotations", async () => {
    for (const who of ["fore1", "client1", "eng2", "pending1"]) {
      await as(who, "aal2")
      await expectFail(noteSql, [P1, bp, "Intruder note"], /row-level security|Blueprint not found/)
    }
    await as(null)
    await expectFail(noteSql, [P1, bp, "Anon note"], /permission denied|row-level security/)
  })

  await test("Everyone on the project sees annotations; outsiders and anonymous do not", async () => {
    for (const who of ["eng1", "fore1", "client1"]) {
      await as(who)
      if ((await count("select count(*) n from public.blueprint_annotations where blueprint_id = $1", [bp])) !== 3) throw new Error(`${who} does not see all annotations`)
    }
    await as("eng2")
    if ((await count("select count(*) n from public.blueprint_annotations where blueprint_id = $1", [bp])) !== 0) throw new Error("outsider sees annotations")
  })

  await test("Engineer moves / resizes / recolours; Foreman and Client cannot; kind and plan cannot change", async () => {
    await as("eng1", "aal2")
    const moved = await db.query("update public.blueprint_annotations set x = 15, y = 12, w = 25, color = 'green' where id = $1 returning id", [ids.rect])
    if (moved.rows.length !== 1) throw new Error("engineer could not edit")
    for (const who of ["fore1", "client1"]) {
      await as(who, "aal2")
      const upd = await db.query("update public.blueprint_annotations set x = 1 where id = $1 returning id", [ids.rect])
      if (upd.rows.length) throw new Error(`${who} edited an annotation`)
    }
    await as("eng1", "aal2")
    await expectFail("update public.blueprint_annotations set kind = 'note', shape = null, w = null, h = null, text = 'now a note' where id = $1", [ids.rect], /cannot change plan or type/)
  })

  await test("Engineer deletes annotations; Foreman and Client cannot", async () => {
    for (const who of ["fore1", "client1"]) {
      await as(who, "aal2")
      if ((await db.query("delete from public.blueprint_annotations where id = $1 returning id", [ids.oval])).rows.length) throw new Error(`${who} deleted an annotation`)
    }
    await as("eng1", "aal2")
    if ((await db.query("delete from public.blueprint_annotations where id = $1 returning id", [ids.oval])).rows.length !== 1) throw new Error("engineer could not delete")
  })

  await test("Annotation changes are audited", async () => {
    await asOwner()
    if ((await count("select count(*) n from public.audit_log where action like 'blueprint_annotations.%'")) < 4) throw new Error("audit rows missing")
  })

  // ---- Checklist ----
  const itemSql = "insert into public.pin_checklist_items (pin_id, project_id, text, done, position) values ($1, $2, $3, true, 99) returning id, position, done, done_by"

  await test("Engineer builds a checklist: order is automatic, items start undone, project comes from the pin", async () => {
    await as("eng1", "aal2")
    const a = (await db.query(itemSql, [pin, OTHER, "Check rebar spacing"])).rows[0]
    const b = (await db.query(itemSql, [pin, P1, "Check concrete cover"])).rows[0]
    const c = (await db.query(itemSql, [pin, P1, "Photograph before pour"])).rows[0]
    if (![a.position, b.position, c.position].every((v, i) => v === i)) throw new Error("positions not 0,1,2")
    if (a.done !== false || a.done_by !== null) throw new Error("item should start undone")
    ids.itemA = a.id
    ids.itemB = b.id
    await asOwner()
    if ((await count("select count(*) n from public.pin_checklist_items where pin_id = $1 and project_id = $2", [pin, P1])) !== 3) throw new Error("project_id not taken from the pin")
  })

  await test("Empty or oversized checklist text is rejected", async () => {
    await as("eng1", "aal2")
    await expectFail(itemSql, [pin, P1, "   "], /text_check|check constraint/)
    await expectFail(itemSql, [pin, P1, "x".repeat(201)], /text_check|check constraint/)
  })

  await test("Foreman, Client and outsiders cannot add or delete checklist items", async () => {
    for (const who of ["fore1", "client1", "eng2"]) {
      await as(who, "aal2")
      await expectFail(itemSql, [pin, P1, "Not allowed"], /row-level security|Pin not found/)
      if ((await db.query("delete from public.pin_checklist_items where id = $1 returning id", [ids.itemA])).rows.length) throw new Error(`${who} deleted an item`)
    }
  })

  await test("Foreman ticks an item: who/when recorded and a timeline entry is written; unticking clears it", async () => {
    await as("fore1", "aal2")
    const ticked = await db.query("update public.pin_checklist_items set done = true where id = $1 returning done_by, done_at", [ids.itemA])
    if (ticked.rows[0].done_by !== ids.fore1 || !ticked.rows[0].done_at) throw new Error("done_by / done_at not set")
    await asOwner()
    if ((await count("select count(*) n from public.pin_events where pin_id = $1 and kind = 'checklist' and note like 'Done:%'", [pin])) !== 1) throw new Error("timeline entry missing")
    await as("fore1", "aal2")
    const reopened = await db.query("update public.pin_checklist_items set done = false where id = $1 returning done_by, done_at", [ids.itemA])
    if (reopened.rows[0].done_by !== null || reopened.rows[0].done_at !== null) throw new Error("done_by / done_at not cleared")
  })

  await test("Foreman cannot rename, reorder or move items; Client cannot tick", async () => {
    await as("fore1", "aal2")
    await expectFail("update public.pin_checklist_items set text = 'Renamed' where id = $1", [ids.itemA], /Only an Engineer can change/)
    await expectFail("update public.pin_checklist_items set position = 9 where id = $1", [ids.itemA], /Only an Engineer can change/)
    await as("client1", "aal2")
    if ((await db.query("update public.pin_checklist_items set done = true where id = $1 returning id", [ids.itemB])).rows.length) throw new Error("client ticked an item")
    await as("eng2", "aal2")
    if ((await db.query("update public.pin_checklist_items set done = true where id = $1 returning id", [ids.itemB])).rows.length) throw new Error("outsider ticked an item")
  })

  await test("Engineer can rename and delete items; Client sees the checklist, outsiders do not", async () => {
    await as("eng1", "aal2")
    if ((await db.query("update public.pin_checklist_items set text = 'Check rebar spacing (200 mm)' where id = $1 returning id", [ids.itemA])).rows.length !== 1) throw new Error("engineer could not rename")
    await as("client1")
    if ((await count("select count(*) n from public.pin_checklist_items where pin_id = $1", [pin])) !== 3) throw new Error("client cannot see the checklist")
    await as("eng2")
    if ((await count("select count(*) n from public.pin_checklist_items where pin_id = $1", [pin])) !== 0) throw new Error("outsider sees the checklist")
    await as("eng1", "aal2")
    if ((await db.query("delete from public.pin_checklist_items where id = $1 returning id", [ids.itemB])).rows.length !== 1) throw new Error("engineer could not delete")
  })

  await test("Checklist ticks appear in the pin timeline function for engineers, hidden from clients", async () => {
    await as("eng1")
    const rows = (await db.query("select * from public.get_pin_timeline($1)", [pin])).rows
    if (!rows.some((r) => r.kind === "checklist" && /^Done:/.test(r.note ?? ""))) throw new Error("checklist entry missing from timeline")
    await as("client1")
    if ((await db.query("select * from public.get_pin_timeline($1)", [pin])).rows.length) throw new Error("client sees the timeline")
  })

  await test("Users cannot write 'checklist' timeline entries themselves", async () => {
    await as("eng1", "aal2")
    await expectFail("insert into public.pin_events (pin_id, project_id, kind, note) values ($1, $2, 'checklist', 'Done: fake')", [pin, P1], /row-level security/)
  })

  // ---- Sheet scale (measuring tape) ----
  await test("Engineer calibrates the measuring tape; invalid scales are rejected; Client cannot change it", async () => {
    await as("eng1", "aal2")
    if ((await db.query("update public.blueprints set scale_width_m = 48.5 where id = $1 returning id", [bp])).rows.length !== 1) throw new Error("engineer could not set the scale")
    await expectFail("update public.blueprints set scale_width_m = 0 where id = $1", [bp], /scale_width_m_check|check constraint/)
    await expectFail("update public.blueprints set scale_width_m = -3 where id = $1", [bp], /scale_width_m_check|check constraint/)
    await expectFail("update public.blueprints set scale_width_m = 1000000 where id = $1", [bp], /scale_width_m_check|check constraint/)
    await as("client1", "aal2")
    if ((await db.query("update public.blueprints set scale_width_m = 1 where id = $1 returning id", [bp])).rows.length) throw new Error("client changed the scale")
  })

  // ---- Thumbnails ----
  const revSql = `insert into public.blueprint_revisions (blueprint_id, project_id, revision, file_path, file_name, mime_type, size_bytes, preview_path, preview_width, preview_height, thumb_path)
    values ($1, $2, 1, $3, 'p.png', 'image/png', 500, $3, 1000, 800, $4) returning thumb_path`
  await test("A revision may carry a thumbnail, but only inside the project folder", async () => {
    await as("eng1", "aal2")
    const ok = await db.query(revSql, [bp, P1, `${P1}/${bp}/a.png`, `${P1}/${bp}/a-thumb.webp`])
    if (!ok.rows[0].thumb_path) throw new Error("thumbnail not saved")
    await expectFail(revSql, [bp, P1, `${P1}/${bp}/b.png`, `${OTHER}/${bp}/b-thumb.webp`], /inside the project folder/)
    const none = await db.query(revSql, [bp, P1, `${P1}/${bp}/c.png`, null])
    if (none.rows[0].thumb_path !== null) throw new Error("null thumbnail should stay null")
  })
}
