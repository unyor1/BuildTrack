// Tests for 0018: arrow / dimension / cloud / symbol objects, groups and atomic multi-item moves.
export default async function ({ db, ids, as, asOwner, test, expectOk, expectFail, count }) {
  const P1 = ids.p1
  await as("eng1", "aal2")
  const bp = (await db.query("insert into public.blueprints (project_id, title) values ($1, 'Editor v3 plan') returning id", [P1])).rows[0].id

  const add = async (kind, extra = {}) => {
    const row = { kind, x: 10, y: 10, color: "orange", ...extra }
    const cols = Object.keys(row)
    const sql = `insert into public.blueprint_annotations (project_id, blueprint_id, ${cols.join(", ")}) values ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")}) returning *`
    return (await db.query(sql, [P1, bp, ...cols.map((c) => (c === "points" ? JSON.stringify(row[c]) : row[c]))])).rows[0]
  }
  const bad = (sql, params, pattern = /check constraint/) => expectFail(sql, [P1, bp, ...params], pattern)

  await test("Engineer creates arrows, dimension lines, revision clouds and symbols; defaults come from the database", async () => {
    await as("eng1", "aal2")
    const arrow = await add("arrow", { points: [[10, 20], [40, 5]], text: "See detail 3" })
    const dim = await add("dimension", { points: [[50, 50], [80, 50]] })
    const cloud = await add("cloud", { points: [[60, 10], [90, 10], [90, 30], [60, 30]], text: "Rev 2 change" })
    const symbol = await add("symbol", { x: 20, y: 60, w: 4, symbol: "north_arrow" })
    Object.assign(ids, { v3arrow: arrow.id, v3dim: dim.id, v3cloud: cloud.id, v3symbol: symbol.id })
    if (Number(arrow.stroke) !== 0.25 || Number(cloud.stroke) !== 0.2 || Number(dim.stroke) !== 0.15) throw new Error("stroke defaults wrong")
    if (Number(arrow.x) !== 10 || Number(arrow.y) !== 5) throw new Error("arrow x/y should mirror the top-left of its points")
    if (Number(cloud.x) !== 60 || Number(cloud.y) !== 10) throw new Error("cloud top-left wrong")
    if (symbol.symbol !== "north_arrow" || Number(symbol.w) !== 4) throw new Error("symbol not stored")
    if (symbol.z_index <= cloud.z_index) throw new Error("new items should go on top")
  })

  await test("Invalid objects are rejected (wrong point counts, text on a dimension, unknown or missing symbol, bad size)", async () => {
    await as("eng1", "aal2")
    await bad("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points) values ($1, $2, 'arrow', 1, 1, $3)", [JSON.stringify([[1, 1], [2, 2], [3, 3]])])
    await bad("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points) values ($1, $2, 'arrow', 1, 1, $3)", [JSON.stringify([[1, 1]])])
    await bad("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points) values ($1, $2, 'dimension', 1, 1, $3)", [JSON.stringify([[1, 1], [2, 2], [3, 3]])])
    await bad("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points, text) values ($1, $2, 'dimension', 1, 1, $3, 'no text here')", [JSON.stringify([[1, 1], [2, 2]])])
    await bad("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points) values ($1, $2, 'cloud', 1, 1, $3)", [JSON.stringify([[1, 1], [2, 2]])])
    await bad("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, points) values ($1, $2, 'cloud', 1, 1, $3)", [JSON.stringify(Array.from({ length: 61 }, (_, i) => [i % 100, (i * 3) % 100]))])
    await bad("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, w) values ($1, $2, 'symbol', 1, 1, 4)", [])
    await bad("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, w, symbol) values ($1, $2, 'symbol', 1, 1, 4, 'unicorn')", [])
    await bad("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, w, symbol) values ($1, $2, 'symbol', 1, 1, 99, 'hazard')", [])
    await bad("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, w, symbol) values ($1, $2, 'symbol', 95, 1, 10, 'hazard')", [])
    await bad("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, w, h, symbol) values ($1, $2, 'symbol', 1, 1, 4, 4, 'hazard')", [])
    await bad("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, text, symbol) values ($1, $2, 'note', 1, 1, 'note', 'hazard')", [], /check constraint/)
  })

  await test("Foreman, Client and outsiders cannot add the new objects", async () => {
    for (const who of ["fore1", "client1", "eng2"]) {
      await as(who, "aal2")
      await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, w, symbol) values ($1, $2, 'symbol', 1, 1, 4, 'hazard')", [P1, bp], /row-level security|Blueprint not found/)
    }
  })

  await test("Groups: members share a group id, it can be set and cleared in one statement, and it works on locked items", async () => {
    await as("eng1", "aal2")
    const group = "11111111-1111-4111-8111-111111111111"
    const set = await db.query("update public.blueprint_annotations set group_id = $2 where id = any($1::uuid[]) returning id", [[ids.v3arrow, ids.v3dim, ids.v3cloud], group])
    if (set.rows.length !== 3) throw new Error("group not set")
    await expectOk("update public.blueprint_annotations set locked = true where id = $1", [ids.v3dim])
    await expectOk("update public.blueprint_annotations set group_id = null where id = $1", [ids.v3dim]) // grouping is not content
    await expectOk("update public.blueprint_annotations set group_id = $2 where id = $1", [ids.v3dim, group])
    await expectOk("update public.blueprint_annotations set locked = false where id = $1", [ids.v3dim])
    const cleared = await db.query("update public.blueprint_annotations set group_id = null where group_id = $1 returning id", [group])
    if (cleared.rows.length !== 3) throw new Error("ungroup failed")
    for (const who of ["fore1", "client1"]) {
      await as(who, "aal2")
      const upd = await db.query("update public.blueprint_annotations set group_id = $2 where id = $1 returning id", [ids.v3arrow, group])
      if (upd.rows.length) throw new Error(`${who} grouped an item`)
    }
  })

  await test("move_annotations moves many items atomically (x/y items and point items together)", async () => {
    await as("eng1", "aal2")
    const moves = JSON.stringify([
      { id: ids.v3symbol, x: 30, y: 70 },
      { id: ids.v3arrow, points: [[15, 25], [45, 10]] },
      { id: ids.v3cloud, points: [[65, 15], [95, 15], [95, 35], [65, 35]] },
    ])
    const moved = await db.query("select public.move_annotations($1::jsonb) as n", [moves])
    if (moved.rows[0].n !== 3) throw new Error("expected 3 items moved")
    const rows = (await db.query("select id, x, y from public.blueprint_annotations where id = any($1::uuid[])", [[ids.v3symbol, ids.v3arrow, ids.v3cloud]])).rows
    const by = Object.fromEntries(rows.map((r) => [r.id, r]))
    if (Number(by[ids.v3symbol].x) !== 30 || Number(by[ids.v3symbol].y) !== 70) throw new Error("symbol not moved")
    if (Number(by[ids.v3arrow].x) !== 15 || Number(by[ids.v3arrow].y) !== 10) throw new Error("arrow x/y should follow its points")
    if (Number(by[ids.v3cloud].x) !== 65) throw new Error("cloud not moved")
  })

  await test("One locked or invalid item refuses the whole batch and nothing moves", async () => {
    await as("eng1", "aal2")
    await expectOk("update public.blueprint_annotations set locked = true where id = $1", [ids.v3symbol])
    const before = (await db.query("select x from public.blueprint_annotations where id = $1", [ids.v3arrow])).rows[0].x
    await expectFail("select public.move_annotations($1::jsonb)", [JSON.stringify([{ id: ids.v3arrow, points: [[50, 50], [60, 60]] }, { id: ids.v3symbol, x: 1, y: 1 }])], /locked/)
    const after = (await db.query("select x from public.blueprint_annotations where id = $1", [ids.v3arrow])).rows[0].x
    if (Number(before) !== Number(after)) throw new Error("the batch was partly applied")
    await expectOk("update public.blueprint_annotations set locked = false where id = $1", [ids.v3symbol])
    await expectFail("select public.move_annotations($1::jsonb)", [JSON.stringify([{ id: "22222222-2222-4222-8222-222222222222", x: 1, y: 1 }])], /not found|not allowed/)
    await expectFail("select public.move_annotations('[]'::jsonb)", [], /between 1 and 300/)
    await expectFail("select public.move_annotations('{\"a\":1}'::jsonb)", [], /between 1 and 300/)
    await expectFail("select public.move_annotations($1::jsonb)", [JSON.stringify([{ id: ids.v3arrow, points: [[1, 1], [500, 5]] }])], /check constraint/)
  })

  await test("Foreman, Client, outsiders and anonymous cannot use move_annotations", async () => {
    const payload = JSON.stringify([{ id: ids.v3arrow, points: [[20, 20], [30, 30]] }])
    for (const who of ["fore1", "client1", "eng2"]) {
      await as(who, "aal2")
      await expectFail("select public.move_annotations($1::jsonb)", [payload], /not found|not allowed/)
    }
    await as(null)
    await expectFail("select public.move_annotations($1::jsonb)", [payload], /permission denied/)
  })

  await test("History names the new objects", async () => {
    await as("eng1", "aal2")
    const text = (await db.query("select summary from public.get_sheet_history($1, 200)", [bp])).rows.map((r) => r.summary).join(" | ")
    for (const expected of [/Added a arrow/, /Added a dimension line/, /Added a revision cloud/, /Added a symbol/, /Moved a symbol/]) {
      if (!expected.test(text)) throw new Error(`history is missing ${expected}\n${text}`)
    }
    if (/grouped|group/i.test(text)) throw new Error("grouping should not create history noise")
  })

  await test("Deleting a sheet still cascades through grouped and locked new objects", async () => {
    await as("eng1", "aal2")
    await expectOk("select public.set_sheet_items_locked($1, true)", [bp])
    await as("admin", "aal2")
    const del = await db.query("delete from public.blueprints where id = $1 returning id", [bp])
    if (del.rows.length !== 1) throw new Error("admin could not delete the sheet")
    await asOwner()
    if ((await count("select count(*) n from public.blueprint_annotations where blueprint_id = $1", [bp])) !== 0) throw new Error("annotations survived")
  })

  await test("The batch function is not callable by anonymous and internal functions stay closed", async () => {
    await as("eng1", "aal2")
    await expectFail("select public.record_annotation_history()", [], /permission denied/)
    await expectFail("select public.guard_annotation_lock()", [], /permission denied/)
  })
}
