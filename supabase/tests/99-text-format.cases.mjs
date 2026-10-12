// Tests for 0024: validated text formatting on text boxes and notes, and the lock rule for it.
export default async function ({ db, ids, as, test, expectOk, expectFail }) {
  const P1 = ids.p1
  await as("eng1", "aal2")
  const bp = (await db.query("insert into public.blueprints (project_id, title) values ($1, 'Format plan') returning id", [P1])).rows[0].id
  const add = async (kind, extra = {}) => {
    const row = { kind, x: 10, y: 10, color: "orange", ...extra }
    const cols = Object.keys(row)
    const sql = `insert into public.blueprint_annotations (project_id, blueprint_id, ${cols.join(", ")}) values ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")}) returning *`
    return (await db.query(sql, [P1, bp, ...cols.map((c) => (c === "format" ? JSON.stringify(row[c]) : row[c]))])).rows[0]
  }
  const setFormat = (id, format) => db.query("update public.blueprint_annotations set format = $2::jsonb where id = $1", [id, JSON.stringify(format)])

  await test("Format defaults to an empty object; text boxes and notes can carry a valid format", async () => {
    await as("eng1", "aal2")
    const plain = await add("text", { w: 20, text: "Hello" })
    if (JSON.stringify(plain.format) !== "{}") throw new Error("default format should be {}")
    const full = { family: "Poppins", bold: true, italic: true, underline: true, strike: false, transform: "uppercase", align: "justify", list: "bullet", line_height: 1.4, letter_spacing: 0.05 }
    await expectOk("update public.blueprint_annotations set format = $2::jsonb where id = $1", [plain.id, JSON.stringify(full)])
    const note = await add("note", { text: "Check this", format: { bold: true, align: "center" } })
    if (note.format.bold !== true || note.format.align !== "center") throw new Error("note format not stored")
    Object.assign(ids, { fmtText: plain.id, fmtNote: note.id })
  })

  await test("Invalid formats are refused: unknown keys, bad values, out-of-range spacing", async () => {
    await as("eng1", "aal2")
    const id = ids.fmtText
    for (const bad of [{ colour: "red" }, { family: "Comic Sans" }, { bold: "yes" }, { transform: "shout" }, { align: "middle" }, { list: "roman" }, { line_height: 5 }, { line_height: 0.2 }, { letter_spacing: 2 }, { letter_spacing: -1 }, { family: 12 }]) {
      await expectFail("update public.blueprint_annotations set format = $2::jsonb where id = $1", [id, JSON.stringify(bad)], /check constraint/)
    }
    await expectFail("update public.blueprint_annotations set format = '[]'::jsonb where id = $1", [id], /check constraint/)
    await expectFail("update public.blueprint_annotations set format = 'null'::jsonb where id = $1", [id], /check constraint|null value/)
  })

  await test("Only text boxes and notes may carry a format", async () => {
    await as("eng1", "aal2")
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, shape, x, y, w, h, format) values ($1, $2, 'shape', 'rect', 10, 10, 10, 10, '{\"bold\":true}'::jsonb)", [P1, bp], /check constraint/)
    await expectFail("insert into public.blueprint_annotations (project_id, blueprint_id, kind, x, y, w, symbol, format) values ($1, $2, 'symbol', 10, 10, 4, 'hazard', '{\"bold\":true}'::jsonb)", [P1, bp], /check constraint/)
  })

  await test("A locked text box cannot be re-formatted until it is unlocked", async () => {
    await as("eng1", "aal2")
    await expectOk("update public.blueprint_annotations set locked = true where id = $1", [ids.fmtText])
    await expectFail("update public.blueprint_annotations set format = '{\"bold\":false}'::jsonb where id = $1", [ids.fmtText], /locked/)
    await expectOk("update public.blueprint_annotations set locked = false where id = $1", [ids.fmtText])
    await setFormat(ids.fmtText, { bold: false })
    const row = (await db.query("select format from public.blueprint_annotations where id = $1", [ids.fmtText])).rows[0]
    if (row.format.bold !== false) throw new Error("format not changed after unlocking")
  })

  await test("Foremen and clients cannot change the format (they cannot edit annotations at all)", async () => {
    for (const who of ["fore1", "client1"]) {
      await as(who)
      const res = await db.query("update public.blueprint_annotations set format = '{\"bold\":true}'::jsonb where id = $1 returning id", [ids.fmtNote])
      if (res.rows.length) throw new Error(who + " changed a format")
    }
  })
}
