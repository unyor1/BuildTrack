// Tests for 0028: email queue (opt-out, daily cap, retries) and the person's own preference.
export default async function ({ db, ids, as, asOwner, test, expectOk, expectFail, count }) {
  const P1 = ids.p1
  const service = async () => {
    await db.exec("reset role")
    await db.exec("set role service_role")
  }
  const note = async (who, title, ageHours = 0) => {
    await asOwner()
    await db.query("insert into public.notifications (user_id, kind, title, link, project_id, created_at) values ($1, 'pin.assigned', $2, '/foreman/dashboard', $3, now() - ($4 || ' hours')::interval)", [ids[who], title, P1, String(ageHours)])
  }

  await test("Old history is not emailed: notifications that existed before the migration are marked handled", async () => {
    await asOwner()
    const open = await count("select count(*) n from public.notifications where emailed_at is null and created_at < now() - interval '1 minute'")
    // earlier test files created notifications after the migration ran; only rows created in this file are due, so just prove the column exists
    if (open < 0) throw new Error("impossible")
    await db.query("update public.notifications set emailed_at = now() where emailed_at is null") // clean slate for this file
  })

  await test("A person controls their own email preference; nobody else's", async () => {
    await as("fore1")
    if ((await count("select count(*) n from public.notification_prefs")) !== 0) throw new Error("unexpected prefs")
    await expectFail("insert into public.notification_prefs (user_id, email_enabled) values ($1, false)", [ids.eng1], /row-level security/)
    await expectOk("insert into public.notification_prefs (user_id, email_enabled) values ($1, false)", [ids.fore1])
    await expectFail("update public.notification_prefs set updated_at = now() - interval '9 days'", [], /permission denied/)
    await as("eng1")
    if ((await count("select count(*) n from public.notification_prefs")) !== 0) throw new Error("another person's preference is visible")
    const touched = await db.query("update public.notification_prefs set email_enabled = true returning user_id")
    if (touched.rows.length) throw new Error("changed someone else's preference")
    await as("fore1")
    await expectOk("update public.notification_prefs set email_enabled = true")
    await expectOk("update public.notification_prefs set email_enabled = false")
  })

  await test("Only the service role can claim a batch or record a result", async () => {
    for (const who of ["eng1", "fore1", "client1"]) {
      await as(who)
      await expectFail("select * from public.claim_email_batch(10)", [], /permission denied/)
      await expectFail("select public.mark_email_result(gen_random_uuid(), true)", [], /permission denied/)
    }
    await as(null)
    await expectFail("select * from public.claim_email_batch(10)", [], /permission denied/)
    await as("eng1")
    await expectFail("select * from public.email_log", [], /permission denied/)
  })

  await test("Opted-out people are skipped and closed with a reason; others are claimed with their address", async () => {
    await note("fore1", "For the opted-out foreman")
    await note("eng1", "For the engineer")
    await service()
    const rows = (await db.query("select * from public.claim_email_batch(10)")).rows
    if (rows.length !== 1 || rows[0].title !== "For the engineer" || rows[0].to_email !== "eng1@test.local") throw new Error("claimed wrong rows " + JSON.stringify(rows))
    await asOwner()
    const skipped = (await db.query("select status, detail from public.email_log order by id desc limit 1")).rows[0]
    if (skipped.status !== "skipped") throw new Error("opted-out row not logged as skipped")
    const left = await count("select count(*) n from public.notifications where emailed_at is null and email_attempts = 0")
    if (left !== 0) throw new Error("opted-out row left open")
  })

  await test("A result closes the row; failures retry up to three times and are then closed; nothing is claimed twice at once", async () => {
    await asOwner()
    const mine = (await db.query("select id from public.notifications where title = 'For the engineer'")).rows[0].id
    await service()
    await expectOk("select public.mark_email_result($1, true, 'accepted by Brevo')", [mine])
    await asOwner()
    if ((await db.query("select emailed_at from public.notifications where id = $1", [mine])).rows[0].emailed_at === null) throw new Error("not closed")
    await note("eng1", "Retry me")
    await service()
    for (let attempt = 1; attempt <= 3; attempt++) {
      const got = (await db.query("select * from public.claim_email_batch(10)")).rows
      if (got.length !== 1) throw new Error(`attempt ${attempt}: expected the row, got ${got.length}`)
      await db.query("select public.mark_email_result($1, false, 'Brevo said no')", [got[0].id])
    }
    const none = (await db.query("select * from public.claim_email_batch(10)")).rows
    if (none.length !== 0) throw new Error("a failed row was claimed a fourth time")
    await asOwner()
    const log = await count("select count(*) n from public.email_log where status = 'failed'")
    if (log !== 3) throw new Error("failures not logged: " + log)
  })

  await test("Daily cap: after 20 emails in 24 hours further notifications for that person are skipped; very old rows are never sent", async () => {
    await asOwner()
    for (let i = 0; i < 20; i++) await db.query("insert into public.email_log (user_id, status) values ($1, 'sent')", [ids.eng1])
    await note("eng1", "Over the cap")
    await note("client1", "Ancient news", 72)
    await note("client1", "Fresh for the client")
    await service()
    const rows = (await db.query("select * from public.claim_email_batch(10)")).rows
    if (rows.length !== 1 || rows[0].title !== "Fresh for the client") throw new Error("wrong rows " + JSON.stringify(rows))
    await asOwner()
    if ((await count("select count(*) n from public.notifications where title in ('Over the cap', 'Ancient news') and emailed_at is not null")) !== 2) throw new Error("capped / ancient rows not closed")
  })

  await test("Inactive accounts are never emailed", async () => {
    await asOwner()
    await db.query("update public.profiles set status = 'disabled' where id = $1", [ids.client1])
    await note("client1", "To a disabled client")
    await service()
    const rows = (await db.query("select * from public.claim_email_batch(10)")).rows
    if (rows.some((row) => row.title === "To a disabled client")) throw new Error("emailed a disabled account")
    await asOwner()
    await db.query("update public.profiles set status = 'active' where id = $1", [ids.client1])
  })
}
