// Tests for 0017: drawing kinds, layering, locks (annotation / pin / base layer) and the edit history.
export default async function ({ db, ids, as, asOwner, test, expectOk, expectFail, count }) {
  const P1 = ids.p1
  await as("eng1", "aal2")
  const bp = (await db.query("insert into public.blueprints (project_id, title) values ($1, 'Editor v2 plan') returning id", [P1])).rows[0].id
  const rev = async (name) => db.query(
    `insert into public.blueprint_revisions (blueprint_id, project_id, revision, file_path, file_name, mime_type, size_bytes, preview_path, preview_width, preview_height)
     values ($1, $2, 1, $3, 'plan.pdf', 'application/pdf', 1000, $4, 800, 600) returning id`,
    [bp, P1, `${P1}/${bp}/${name}.pdf`, `${P1}/${bp}/${name}.png`])

  const add = async (kind, extra = {}) => {
    const row = { kind, x: 10, y: 10, color: "orange", ...extra }
    const cols = Object.keys(row)
    const sql = `insert into public.blueprint_annotations (project_id, blueprint_id, ${cols.join(", ")}) values ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")}) returning *`
    return (await db.query(sql, [P1, bp, ...cols.map((c) => (c === "points" ? JSON.stringify(row[c]) : row[c]))])).rows[0]
  }
  const z = async (...keys) => (await db.query("select id, z_index from public.blueprint_annotations where id = any($1::uuid[]) order by z_index", [keys.map((k) => ids[k])])).rows.map((r) => Object.keys(ids).find((k) => ids[k] === r.id))
  const history = async (who = "eng1") => {
    await as(who, "aal2")
    return (await db.query("select * from public.get_sheet_history($1, 200)", [bp])).rows
  }

  // ---- New kinds ----
  await test("Engineer creates text boxes, freehand strokes, highlights, polylines and areas; the database fills defaults", async () => {
    await as("eng1", "aal2")
    const text = await add("text", { x: 20, y: 20, w: 30, text: "Verify slab thickness" })
    const pen = await add("draw", { points: [[40, 50], [45, 55], [52, 48]] })
    const marker = await add("highlight", { points: [[10, 10], [60, 12]], opacity: 0.4, color: "yellow" })
    const line = await add("polyline", { points: [[5, 5], [25, 5], [25, 30]], text: "Duct run" })
    const area = await add("area", { points: [[60, 60], [90, 60], [90, 90], [60, 90]] })
    ids.t1 = text.id; ids.pen = pen.id; ids.hl = marker.id; ids.pl = line.id; ids.ar = area.id
    if (Number(text.font_size) !== 1.6) throw new Error("text font size default missing")
    if (Number(pen.stroke) !== 0.2 || Number(marker.stroke) !== 1.4 || Number(line.stroke) !== 0.15) throw new Error("stroke defaults wrong")
    if (Number(pen.x) !== 40 || Number(pen.y) !== 48) throw new Error(`x/y should mirror the drawing's top-left corner, got ${pen.x},${pen.y}`)
    if (Number(area.x) !== 60 || Number(area.y) !== 60) throw new Error("area top-left wrong")
    if (marker.color !== "yellow" || Number(marker.opacity) !== 0.4) throw new Error("highlight style not stored")
    if (text.created_by !== ids.eng1) throw new Error("creator not set")
  })

  await test("New items go on top: z_index is assigned by the database, not the client", async () => {
    await as("eng1", "aal2")
    const rows = (await db.query("select id, z_index from public.blueprint_annotations where blueprint_id = $1 order by z_index", [bp])).rows
    if (rows.map((r) => r.z_index).join() !== "0,1,2,3,4") throw new Error(`unexpected order ${rows.map((r) => r.z_index)}`)
    const cheat = await add("note", { x: 5, y: 5, text: "z cheat", z_index: 999 })
    ids.n1 = cheat.id
    if (cheat.z_index !== 5) throw new Error(`client-chosen z_index was used: ${cheat.z_index}`)
  })

  await test("Invalid drawings are rejected (too few points, out of range, wrong shape of data, text on a stroke, bad style)", async () => {
    await as("eng1", "aal2")
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points) values ($1, $2, 'draw', 1, 1, '[[1,1]]')", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points) values ($1, $2, 'area', 1, 1, '[[1,1],[5,5]]')", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points) values ($1, $2, 'draw', 1, 1, '[[1,1],[101,5]]')", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points) values ($1, $2, 'draw', 1, 1, '[[1,1],[\"a\",5]]')", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points) values ($1, $2, 'draw', 1, 1, '[[1,1,3],[5,5]]')", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points) values ($1, $2, 'draw', 1, 1, '{\"a\":1}')", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points, text) values ($1, $2, 'draw', 1, 1, '[[1,1],[2,2]]', 'no text on strokes')", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, text) values ($1, $2, 'text', 1, 1, '   ')", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, text, points) values ($1, $2, 'note', 1, 1, 'note', '[[1,1],[2,2]]')", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points, stroke) values ($1, $2, 'draw', 1, 1, '[[1,1],[2,2]]', 9)", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points, opacity) values ($1, $2, 'draw', 1, 1, '[[1,1],[2,2]]', 0)", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, text, font_size) values ($1, $2, 'text', 1, 1, 'big', 40)", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points) values ($1, $2, 'scribble', 1, 1, '[[1,1],[2,2]]')", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, text, color) values ($1, $2, 'note', 1, 1, 'x', 'pink')", [P1, bp], /color_check/)
  })

  await test("Moving a drawing rewrites its points; x / y follow the points (a client-sent x / y is ignored)", async () => {
    await as("eng1", "aal2")
    const moved = await db.query("update public.blueprint_annotations set points = '[[50,50],[60,60]]', x = 1, y = 1 where id = $1 returning x, y", [ids.pen])
    if (Number(moved.rows[0].x) !== 50 || Number(moved.rows[0].y) !== 50) throw new Error("x / y did not follow the points")
  })

  await test("Foreman, Client, outsiders and anonymous cannot add drawings; project people can read them", async () => {
    for (const who of ["fore1", "client1", "eng2"]) {
      await as(who, "aal2")
      await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points) values ($1, $2, 'draw', 1, 1, '[[1,1],[2,2]]')", [P1, bp], /row-level security|Blueprint not found/)
    }
    await as(null)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points) values ($1, $2, 'draw', 1, 1, '[[1,1],[2,2]]')", [P1, bp], /permission denied|row-level security/)
    for (const who of ["eng1", "fore1", "client1"]) {
      await as(who)
      if ((await count("select count(*) n from public.blueprint_annotations where blueprint_id = $1", [bp])) !== 6) throw new Error(`${who} cannot read the drawings`)
    }
    await as("eng2")
    if ((await count("select count(*) n from public.blueprint_annotations where blueprint_id = $1", [bp])) !== 0) throw new Error("outsider reads drawings")
  })

  // ---- Layering ----
  await test("Bring to front / send to back / forward / backward renumber the sheet 0..n-1 with no gaps", async () => {
    await as("eng1", "aal2")
    // order now: t1(0) pen(1) hl(2) pl(3) ar(4) n1(5)
    await expectOk("select public.move_annotation_layer($1, 'front')", [ids.t1])
    if ((await z("t1", "pen", "hl", "pl", "ar", "n1")).join() !== "pen,hl,pl,ar,n1,t1") throw new Error("front failed")
    await expectOk("select public.move_annotation_layer($1, 'back')", [ids.n1])
    if ((await z("t1", "pen", "hl", "pl", "ar", "n1")).join() !== "n1,pen,hl,pl,ar,t1") throw new Error("back failed")
    await expectOk("select public.move_annotation_layer($1, 'forward')", [ids.pen])
    if ((await z("t1", "pen", "hl", "pl", "ar", "n1")).join() !== "n1,hl,pen,pl,ar,t1") throw new Error("forward failed")
    await expectOk("select public.move_annotation_layer($1, 'backward')", [ids.ar])
    if ((await z("t1", "pen", "hl", "pl", "ar", "n1")).join() !== "n1,hl,pen,ar,pl,t1") throw new Error("backward failed")
    const zs = (await db.query("select z_index from public.blueprint_annotations where blueprint_id = $1 order by z_index", [bp])).rows.map((r) => r.z_index)
    if (zs.join() !== "0,1,2,3,4,5") throw new Error(`z_index not dense: ${zs}`)
  })

  await test("Layer moves at the edges change nothing and are not logged", async () => {
    await as("eng1", "aal2")
    const before = (await history()).length
    await expectOk("select public.move_annotation_layer($1, 'front')", [ids.t1]) // already on top
    await expectOk("select public.move_annotation_layer($1, 'backward')", [ids.n1]) // already at the bottom
    if ((await history()).length !== before) throw new Error("a no-op layer move was logged")
    await as("eng1", "aal2")
    await expectFail("select public.move_annotation_layer($1, 'sideways')", [ids.t1], /Unknown layer action/)
    await expectFail("select public.move_annotation_layer(gen_random_uuid(), 'front')", [], /Item not found/)
  })

  await test("Only people who may edit blueprints can change layers", async () => {
    for (const who of ["fore1", "client1", "eng2", "pending1"]) {
      await as(who, "aal2")
      await expectFail("select public.move_annotation_layer($1, 'back')", [ids.t1], /not allowed|Item not found/)
    }
    await as(null)
    await expectFail("select public.move_annotation_layer($1, 'back')", [ids.t1], /permission denied/)
  })

  // ---- Annotation locks ----
  await test("A locked annotation cannot be moved, edited, restyled or deleted; layers still work; unlocking restores editing", async () => {
    await as("eng1", "aal2")
    await expectOk("update public.blueprint_annotations set locked = true where id = $1", [ids.t1])
    await expectFail("update public.blueprint_annotations set x = 30 where id = $1", [ids.t1], /locked/)
    await expectFail("update public.blueprint_annotations set text = 'changed' where id = $1", [ids.t1], /locked/)
    await expectFail("update public.blueprint_annotations set color = 'red' where id = $1", [ids.t1], /locked/)
    await expectFail("update public.blueprint_annotations set opacity = 0.5 where id = $1", [ids.t1], /locked/)
    await expectFail("delete from public.blueprint_annotations where id = $1", [ids.t1], /locked/)
    await expectOk("select public.move_annotation_layer($1, 'back')", [ids.t1])
    await expectOk("update public.blueprint_annotations set locked = false where id = $1", [ids.t1])
    await expectOk("update public.blueprint_annotations set x = 30, text = 'Verify slab thickness (checked)' where id = $1", [ids.t1])
  })

  await test("Foreman and Client cannot lock or unlock anything", async () => {
    for (const who of ["fore1", "client1"]) {
      await as(who, "aal2")
      const upd = await db.query("update public.blueprint_annotations set locked = true where id = $1 returning id", [ids.pl])
      if (upd.rows.length) throw new Error(`${who} locked an annotation`)
    }
  })

  // ---- Pin locks ----
  await test("A locked pin cannot be moved, renamed or deleted, but its status can still be reported and set", async () => {
    await as("eng1", "aal2")
    ids.pinA = (await db.query("insert into public.pins (project_id, blueprint_id, x, y, title) values ($1, $2, 40, 40, 'Column C9') returning id", [P1, bp])).rows[0].id
    await expectOk("update public.pins set locked = true where id = $1", [ids.pinA])
    await expectFail("update public.pins set x = 50 where id = $1", [ids.pinA], /locked/)
    await expectFail("update public.pins set title = 'Renamed' where id = $1", [ids.pinA], /locked/)
    await expectFail("update public.pins set description = 'edited' where id = $1", [ids.pinA], /locked/)
    await expectFail("delete from public.pins where id = $1", [ids.pinA], /locked/)
    await expectOk("update public.pins set status = 'in_progress' where id = $1", [ids.pinA])
    await as("fore1", "aal2")
    await expectOk("select public.report_pin_progress($1, 'for_review', 'ready')", [ids.pinA])
    await as("eng1", "aal2")
    await expectOk("update public.pins set locked = false where id = $1", [ids.pinA])
    await expectOk("update public.pins set x = 55 where id = $1", [ids.pinA])
  })

  await test("Lock all / unlock all covers every annotation and pin of the sheet; outsiders and Clients are refused", async () => {
    await as("eng1", "aal2")
    await expectOk("select public.set_sheet_items_locked($1, true)", [bp])
    if ((await count("select count(*) n from public.blueprint_annotations where blueprint_id = $1 and not locked", [bp])) !== 0) throw new Error("an annotation stayed unlocked")
    if ((await count("select count(*) n from public.pins where blueprint_id = $1 and not locked", [bp])) !== 0) throw new Error("a pin stayed unlocked")
    await expectFail("update public.pins set x = 1 where id = $1", [ids.pinA], /locked/)
    for (const who of ["client1", "fore1", "eng2"]) {
      await as(who, "aal2")
      await expectFail("select public.set_sheet_items_locked($1, false)", [bp], /not allowed|Sheet not found/)
    }
    await as("eng1", "aal2")
    await expectOk("select public.set_sheet_items_locked($1, false)", [bp])
    if ((await count("select count(*) n from public.blueprint_annotations where blueprint_id = $1 and locked", [bp])) !== 0) throw new Error("an annotation stayed locked")
  })

  // ---- Base layer lock ----
  await test("A locked base layer blocks new revisions and scale changes; titles still change; unlocking restores both", async () => {
    await as("eng1", "aal2")
    await expectOk("update public.blueprints set scale_width_m = 40 where id = $1", [bp])
    await expectOk("update public.blueprints set base_locked = true where id = $1", [bp])
    await expectFail("update public.blueprints set scale_width_m = 55 where id = $1", [bp], /base layer/)
    await expectFail(`insert into public.blueprint_revisions (blueprint_id, project_id, revision, file_path, file_name, mime_type, size_bytes, preview_path, preview_width, preview_height)
      values ($1, $2, 1, $3, 'x.pdf', 'application/pdf', 10, $4, 800, 600)`, [bp, P1, `${P1}/${bp}/x.pdf`, `${P1}/${bp}/x.png`], /base layer/)
    await expectOk("update public.blueprints set title = 'Editor v2 plan (issued)' where id = $1", [bp])
    await expectOk("update public.blueprints set base_locked = false where id = $1", [bp])
    await expectOk("update public.blueprints set scale_width_m = 55 where id = $1", [bp])
    await rev("first")
  })

  await test("Foreman and Client cannot lock the base layer", async () => {
    for (const who of ["fore1", "client1"]) {
      await as(who, "aal2")
      const upd = await db.query("update public.blueprints set base_locked = true where id = $1 returning id", [bp])
      if (upd.rows.length) throw new Error(`${who} locked the base layer`)
    }
  })

  // ---- History ----
  await test("The edit history shows who did what, newest first, including locks, layers and deleted pins", async () => {
    const withPin = (await history()).map((r) => r.summary).join(" | ") // the pin still exists: its timeline is part of the history
    for (const expected of [/Added pin "Column C9"/, /Pin "Column C9" is now for review/]) if (!expected.test(withPin)) throw new Error(`history is missing ${expected}`)
    await as("eng1", "aal2")
    // Column C9 went "for review", so it is evidence and stays (0033); a pin that never left "not started" can be deleted.
    await expectFail("delete from public.pins where id = $1", [ids.pinA], /evidence/)
    const temp = (await db.query("insert into public.pins (project_id, blueprint_id, x, y, title) values ($1, $2, 60, 60, 'Temporary marker') returning id", [P1, bp])).rows[0].id
    await expectOk("delete from public.pins where id = $1", [temp])
    const rows = await history()
    const text = rows.map((r) => r.summary).join(" | ")
    for (const expected of [/Added a text box: "Verify slab thickness"/, /Added a freehand drawing/, /Added a highlight/, /Added a polyline/, /Added a area outline|Added a area/, /Locked a text box/, /Unlocked a text box/, /Moved a freehand drawing/, /Brought an item to the front/, /Sent an item to the back/, /Locked every item on the sheet/, /Locked the base layer/, /Unlocked the base layer/, /Deleted pin "Temporary marker"/]) {
      if (!expected.test(text)) throw new Error(`history is missing ${expected}\n${text}`)
    }
    if (rows[0].actor_name !== "eng1" && rows[0].actor_name !== "eng1@test.local") throw new Error(`actor missing: ${rows[0].actor_name}`)
    for (let i = 1; i < rows.length; i++) if (new Date(rows[i - 1].created_at) < new Date(rows[i].created_at)) throw new Error("not newest first")
  })

  await test("History is readable by Foremen and admins, never by Clients, outsiders, anonymous; the table itself is closed", async () => {
    for (const who of ["fore1", "eng1"]) if ((await history(who)).length < 5) throw new Error(`${who} cannot read the history`)
    await as("admin", "aal2")
    if ((await db.query("select * from public.get_sheet_history($1, 50)", [bp])).rows.length < 5) throw new Error("admin cannot read the history")
    for (const who of ["client1", "eng2", "pending1"]) if ((await history(who)).length !== 0) throw new Error(`${who} reads the history`)
    await as(null)
    await expectFail("select * from public.get_sheet_history($1, 10)", [bp], /permission denied/)
    await as("eng1", "aal2")
    await expectFail("select * from public.sheet_history", [], /permission denied/)
    await expectFail("insert into public.sheet_history (project_id, blueprint_id, action, item_type, summary) values ($1, $2, 'x', 'sheet', 'forged')", [P1, bp], /permission denied/)
    if ((await db.query("select * from public.get_sheet_history($1, 3)", [bp])).rows.length !== 3) throw new Error("limit ignored")
  })

  await test("Internal functions cannot be called through the API", async () => {
    await as("eng1", "aal2")
    await expectFail("select public.log_sheet_event($1, 'x', 'sheet', null, null, 'forged entry')", [bp], /permission denied/)
    await expectFail("select public.record_annotation_history()", [], /permission denied/)
    await expectFail("select public.guard_annotation_lock()", [], /permission denied/)
  })

  await test("Deleting a whole sheet still works when it holds locked items (cascade is not blocked), unless it holds evidence", async () => {
    // bp holds Column C9, which went "for review": it is evidence, so the sheet stays (0033).
    await as("admin", "aal2")
    await expectFail("delete from public.blueprints where id = $1", [bp], /evidence/)
    await as("eng1", "aal2")
    const spare = (await db.query("insert into public.blueprints (project_id, title) values ($1, 'Locked spare') returning id", [P1])).rows[0].id
    await expectOk("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, w, color, text) values ($1, $2, 'text', 5, 5, 30, 'orange', 'Draft note')", [P1, spare])
    await expectOk("select public.set_sheet_items_locked($1, true)", [spare])
    ids.pinB = (await db.query("insert into public.pins (project_id, blueprint_id, x, y, title, locked) values ($1, $2, 20, 20, 'Locked pin', true) returning id", [P1, spare])).rows[0].id
    await as("admin", "aal2")
    const del = await db.query("delete from public.blueprints where id = $1 returning id", [spare])
    if (del.rows.length !== 1) throw new Error("admin could not delete the sheet")
    await asOwner()
    if ((await count("select count(*) n from public.blueprint_annotations where blueprint_id = $1", [spare])) !== 0) throw new Error("annotations survived")
    if ((await count("select count(*) n from public.sheet_history where blueprint_id = $1", [spare])) !== 0) throw new Error("history survived the sheet")
  })
}
