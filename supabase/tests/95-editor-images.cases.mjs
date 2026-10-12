// Tests for 0019: floating images, rotation and reorder_annotations.
export default async function ({ db, ids, as, asOwner, test, expectOk, expectFail, count }) {
  const P1 = ids.p1
  await as("eng1", "aal2")
  const bp = (await db.query("insert into public.blueprints (project_id, title) values ($1, 'Images plan') returning id", [P1])).rows[0].id
  const path = (name = "img-1.webp") => `${P1}/${bp}/${name}`

  const add = async (kind, extra = {}) => {
    const row = { kind, x: 10, y: 10, color: "orange", ...extra }
    const cols = Object.keys(row)
    const sql = `insert into public.blueprint_annotations (project_id, blueprint_id, ${cols.join(", ")}) values ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")}) returning *`
    return (await db.query(sql, [P1, bp, ...cols.map((c) => (c === "points" ? JSON.stringify(row[c]) : row[c]))])).rows[0]
  }
  const bad = (kind, extra, pattern = /check constraint/) => expectFail(`insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, ${Object.keys(extra).join(", ")}) values ($1, $2, '${kind}', 10, 10, ${Object.keys(extra).map((_, i) => `$${i + 3}`).join(", ")})`, [P1, bp, ...Object.values(extra)], pattern)

  await test("Engineer places an image; position, size, rotation and caption are stored; it goes on top", async () => {
    await as("eng1", "aal2")
    const first = await add("note", { text: "below" })
    const img = await add("image", { w: 30, h: 20, image_path: path(), rotation: 15.5, text: "Vendor spec for door D4" })
    ids.img = img.id
    ids.below = first.id
    if (Number(img.w) !== 30 || Number(img.h) !== 20 || Number(img.rotation) !== 15.5 || img.image_path !== path()) throw new Error("image fields not stored")
    if (img.z_index <= first.z_index) throw new Error("the image should be on top")
    if (img.created_by !== ids.eng1) throw new Error("creator not set")
  })

  await test("Invalid images are rejected (missing file, other project folder, sizes, bounds, points, rotation, file on a non-image)", async () => {
    await as("eng1", "aal2")
    await bad("image", { w: 20, h: 20 }) // no file
    await bad("image", { w: 20, h: 20, image_path: `${ids.other}/x/img-9.webp` }, /project folder/)
    await bad("image", { w: 0.1, h: 20, image_path: path("a.webp") })
    await bad("image", { w: 20, h: 150, image_path: path("b.webp") })
    await bad("image", { w: 95, h: 20, image_path: path("c.webp") }) // x + w beyond the sheet
    await bad("image", { w: 20, h: 20, image_path: path("d.webp"), rotation: 400 })
    await bad("image", { w: 20, image_path: path("e.webp") }) // no height
    await bad("note", { text: "note with a file", image_path: path("f.webp") })
    await bad("image", { w: 20, h: 20, image_path: path("g.webp"), points: JSON.stringify([[1, 1], [2, 2]]) })
    await bad("image", { w: 20, h: 20, image_path: "short" }, /project folder|check constraint/) // the folder rule fires first
  })

  await test("Rotation works on shapes, text boxes and symbols too", async () => {
    await as("eng1", "aal2")
    const shape = await add("shape", { shape: "rect", w: 10, h: 10, rotation: -30 })
    const text = await add("text", { text: "Rotated label", w: 20, rotation: 90 })
    const symbol = await add("symbol", { symbol: "hazard", w: 4, rotation: 45 })
    if (Number(shape.rotation) !== -30 || Number(text.rotation) !== 90 || Number(symbol.rotation) !== 45) throw new Error("rotation not stored")
    await expectOk("update public.blueprint_annotations set rotation = 120 where id = $1", [shape.id])
    await expectFail("update public.blueprint_annotations set rotation = 361 where id = $1", [shape.id], /check constraint/)
  })

  await test("The image file cannot be swapped, but size, position, rotation and caption can change", async () => {
    await as("eng1", "aal2")
    await expectFail("update public.blueprint_annotations set image_path = $2 where id = $1", [ids.img, path("other.webp")], /cannot be replaced/)
    await expectOk("update public.blueprint_annotations set w = 40, h = 25, x = 20, y = 30, rotation = -10, text = 'New caption' where id = $1", [ids.img])
  })

  await test("Foreman, Client and outsiders cannot add or change images; everyone on the project can read them", async () => {
    for (const who of ["fore1", "client1", "eng2"]) {
      await as(who, "aal2")
      await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, w, h, image_path) values ($1, $2, 'image', 5, 5, 10, 10, $3)", [P1, bp, path("z.webp")], /row-level security|Blueprint not found/)
      const upd = await db.query("update public.blueprint_annotations set rotation = 5 where id = $1 returning id", [ids.img])
      if (upd.rows.length) throw new Error(`${who} rotated an image`)
    }
    for (const who of ["eng1", "fore1", "client1"]) {
      await as(who)
      if ((await count("select count(*) n from public.blueprint_annotations where id = $1", [ids.img])) !== 1) throw new Error(`${who} cannot read the image`)
    }
    await as("eng2")
    if ((await count("select count(*) n from public.blueprint_annotations where id = $1", [ids.img])) !== 0) throw new Error("outsider reads the image")
  })

  await test("A locked image keeps its size, position and rotation; unlocking restores editing", async () => {
    await as("eng1", "aal2")
    await expectOk("update public.blueprint_annotations set locked = true where id = $1", [ids.img])
    await expectFail("update public.blueprint_annotations set rotation = 90 where id = $1", [ids.img], /locked/)
    await expectFail("update public.blueprint_annotations set w = 10, h = 10 where id = $1", [ids.img], /locked/)
    await expectFail("delete from public.blueprint_annotations where id = $1", [ids.img], /locked/)
    await expectOk("update public.blueprint_annotations set locked = false where id = $1", [ids.img])
    await expectOk("update public.blueprint_annotations set rotation = 90 where id = $1", [ids.img])
  })

  await test("reorder_annotations sets the whole order atomically; wrong lists and wrong people are refused", async () => {
    await as("eng1", "aal2")
    const all = (await db.query("select id from public.blueprint_annotations where blueprint_id = $1 order by z_index", [bp])).rows.map((r) => r.id)
    const reversed = [...all].reverse()
    await expectOk("select public.reorder_annotations($1, $2::uuid[])", [bp, reversed])
    const now = (await db.query("select id, z_index from public.blueprint_annotations where blueprint_id = $1 order by z_index", [bp])).rows
    if (now.map((r) => r.id).join() !== reversed.join() || now.map((r) => r.z_index).join() !== now.map((_, i) => i).join()) throw new Error("order not applied densely")
    await expectFail("select public.reorder_annotations($1, $2::uuid[])", [bp, all.slice(1)], /does not match/) // one missing
    await expectFail("select public.reorder_annotations($1, $2::uuid[])", [bp, [...all, all[0]]], /does not match/) // duplicate
    await expectFail("select public.reorder_annotations($1, $2::uuid[])", [bp, [...all.slice(1), "33333333-3333-4333-8333-333333333333"]], /does not match/) // stranger
    await expectFail("select public.reorder_annotations($1, $2::uuid[])", ["33333333-3333-4333-8333-333333333333", all], /Sheet not found/)
    for (const who of ["fore1", "client1", "eng2"]) {
      await as(who, "aal2")
      await expectFail("select public.reorder_annotations($1, $2::uuid[])", [bp, all], /not allowed|does not match/)
    }
    await as(null)
    await expectFail("select public.reorder_annotations($1, $2::uuid[])", [bp, all], /permission denied/)
  })

  await test("Locked items can still be reordered (layer order is not content); the history names images and rotation", async () => {
    await as("eng1", "aal2")
    await expectOk("update public.blueprint_annotations set locked = true where id = $1", [ids.img])
    const all = (await db.query("select id from public.blueprint_annotations where blueprint_id = $1 order by z_index", [bp])).rows.map((r) => r.id)
    await expectOk("select public.reorder_annotations($1, $2::uuid[])", [bp, [...all].reverse()])
    await expectOk("update public.blueprint_annotations set locked = false where id = $1", [ids.img])
    const text = (await db.query("select summary from public.get_sheet_history($1, 200)", [bp])).rows.map((r) => r.summary).join(" | ")
    for (const expected of [/Added a image: "Vendor spec for door D4"/, /Rotated a image/, /Resized a image/, /Changed the layer order/]) {
      if (!expected.test(text)) throw new Error(`history is missing ${expected}\n${text}`)
    }
  })

  await test("Deleting the sheet removes its images (cascade, even when locked)", async () => {
    await as("eng1", "aal2")
    await expectOk("select public.set_sheet_items_locked($1, true)", [bp])
    await as("admin", "aal2")
    const del = await db.query("delete from public.blueprints where id = $1 returning id", [bp])
    if (del.rows.length !== 1) throw new Error("admin could not delete the sheet")
    await asOwner()
    if ((await count("select count(*) n from public.blueprint_annotations where blueprint_id = $1", [bp])) !== 0) throw new Error("images survived")
  })
}
