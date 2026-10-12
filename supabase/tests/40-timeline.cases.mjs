// Tests for 0011 (get_pin_timeline): names for the timeline, same privacy as pin_events.
export default async function ({ db, ids, as, asOwner, test, expectOk, expectFail, count }) {
  const P1 = ids.p1
  await as("eng1", "aal2")
  const bp = (await db.query("insert into public.blueprints (project_id, title) values ($1, 'Timeline plan') returning id", [P1])).rows[0].id
  const pin = (await db.query("insert into public.pins (project_id, blueprint_id, x, y, title) values ($1, $2, 10, 10, 'Timeline pin') returning id", [P1, bp])).rows[0].id
  await expectOk("update public.pins set status = 'in_progress' where id = $1", [pin])
  await expectOk("insert into public.pin_events (pin_id, project_id, kind, note) values ($1, $2, 'comment', 'Checking now')", [pin, P1])

  const timeline = (who, aal = "aal1") => as(who, aal).then(() => db.query("select * from public.get_pin_timeline($1)", [pin]))

  await test("Engineer and Foreman see the timeline with names, roles and statuses", async () => {
    for (const who of ["eng1", "fore1"]) {
      const { rows } = await timeline(who)
      if (rows.length < 3) throw new Error(`${who} sees ${rows.length} entries`)
      if (!rows.every((r) => r.actor_name)) throw new Error("actor name missing")
      const status = rows.find((r) => r.kind === "status")
      if (status.from_status !== "not_started" || status.to_status !== "in_progress") throw new Error("status change wrong")
      if (!rows.some((r) => r.kind === "comment" && r.note === "Checking now" && r.actor_role === "engineer")) throw new Error("comment/role missing")
      if (rows.some((r) => "email" in r)) throw new Error("emails must not be returned")
    }
  })

  await test("Entries come in order (oldest first)", async () => {
    const { rows } = await timeline("eng1")
    const sorted = [...rows].sort((a, b) => Number(a.id) - Number(b.id))
    if (rows.map((r) => r.id).join() !== sorted.map((r) => r.id).join()) throw new Error("not ordered")
    if (rows[0].kind !== "created") throw new Error("first entry should be 'created'")
  })

  await test("Client, outsiders, pending users and admins without MFA get nothing; anon is blocked", async () => {
    for (const [who, aal] of [["client1", "aal2"], ["eng2", "aal2"], ["fore3", "aal2"], ["pending1", "aal2"], ["admin", "aal1"]]) {
      const { rows } = await timeline(who, aal)
      if (rows.length) throw new Error(`${who} sees the timeline`)
    }
    await as(null)
    await expectFail("select * from public.get_pin_timeline($1)", [pin], /permission denied/)
  })

  await test("Admin with MFA and project permissions sees it", async () => {
    const { rows } = await timeline("projonly", "aal2")
    if (rows.length < 3) throw new Error("project manager cannot see the timeline")
  })
}
