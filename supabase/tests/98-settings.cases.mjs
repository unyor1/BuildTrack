// Tests for 0022: system settings (read by everyone active, written only by a Super Admin through set_setting) and the inactive-accounts report.
export default async function ({ db, ids, as, asOwner, test, expectOk, expectFail, count, addUser }) {
  const value = async (key) => (await db.query("select value from public.system_settings where key = $1", [key])).rows[0]?.value

  await test("Every active person can read the settings; defaults are in place", async () => {
    for (const who of ["eng1", "fore1", "client1", "super"]) {
      await as(who)
      if ((await count("select count(*) n from public.system_settings")) < 5) throw new Error(who + " cannot read the settings")
    }
    await asOwner()
    if ((await value("qa.acceptance_threshold")) !== 90) throw new Error("default threshold should be 90")
    const weights = await value("qa.weights")
    if (weights.critical !== 5 || weights.major !== 3 || weights.minor !== 1) throw new Error("default weights wrong")
  })

  await test("Nobody writes settings directly; only a Super Admin with MFA can use set_setting", async () => {
    await as("super", "aal2")
    await expectFail("update public.system_settings set value = '1'::jsonb where key = 'qa.acceptance_threshold'", [], /permission denied/)
    await expectFail("insert into public.system_settings (key, value) values ('x.y', '1'::jsonb)", [], /permission denied/)
    for (const who of ["admin", "noperm", "eng1", "fore1", "client1"]) {
      await as(who, "aal2")
      await expectFail("select public.set_setting('qa.acceptance_threshold', '85'::jsonb)", [], /Only a Super Admin/)
    }
    await as("super", "aal1")
    await expectFail("select public.set_setting('qa.acceptance_threshold', '85'::jsonb)", [], /Only a Super Admin/)
    await as("super", "aal2")
    await expectOk("select public.set_setting('qa.acceptance_threshold', '85'::jsonb)")
    await asOwner()
    if ((await value("qa.acceptance_threshold")) !== 85) throw new Error("value not stored")
    const row = (await db.query("select updated_by from public.system_settings where key = 'qa.acceptance_threshold'")).rows[0]
    if (row.updated_by !== ids.super) throw new Error("updated_by not recorded")
    if ((await count("select count(*) n from public.audit_log where action = 'settings.update'")) < 1) throw new Error("change not audited")
  })

  await test("Each setting is validated", async () => {
    await as("super", "aal2")
    await expectFail("select public.set_setting('nope.nothing', '1'::jsonb)", [], /Unknown setting/)
    await expectFail("select public.set_setting('qa.acceptance_threshold', '49'::jsonb)", [], /50 to 100/)
    await expectFail("select public.set_setting('qa.acceptance_threshold', '90.5'::jsonb)", [], /whole number/)
    await expectFail("select public.set_setting('qa.acceptance_threshold', '\"high\"'::jsonb)", [], /whole number/)
    await expectFail(`select public.set_setting('qa.weights', '{"critical":1,"major":3,"minor":1}'::jsonb)`, [], /at least as much/)
    await expectFail(`select public.set_setting('qa.weights', '{"critical":5,"major":3}'::jsonb)`, [], /exactly/)
    await expectFail(`select public.set_setting('qa.weights', '{"critical":50,"major":3,"minor":1}'::jsonb)`, [], /1 to 20/)
    await expectOk(`select public.set_setting('qa.weights', '{"critical":6,"major":3,"minor":1}'::jsonb)`)
    await expectFail(`select public.set_setting('work.hours', '{"start":"17:00","end":"07:00","days":[1]}'::jsonb)`, [], /after the start/)
    await expectFail(`select public.set_setting('work.hours', '{"start":"7am","end":"17:00","days":[1]}'::jsonb)`, [], /HH:MM/)
    await expectFail(`select public.set_setting('work.hours', '{"start":"07:00","end":"17:00","days":[]}'::jsonb)`, [], /at least one/)
    await expectFail(`select public.set_setting('work.hours', '{"start":"07:00","end":"17:00","days":[1,1]}'::jsonb)`, [], /each once/)
    await expectFail(`select public.set_setting('work.hours', '{"start":"07:00","end":"17:00","days":[8]}'::jsonb)`, [], /1 to 7/)
    await expectOk(`select public.set_setting('work.hours', '{"start":"06:30","end":"16:30","days":[1,2,3,4,5]}'::jsonb)`)
    await expectFail(`select public.set_setting('standards', '[{"code":"X","title":"Too short code"}]'::jsonb)`, [], /code/)
    await expectFail(`select public.set_setting('standards', '[{"code":"NSCP 2015","title":"Structural code"},{"code":"nscp 2015","title":"Duplicate"}]'::jsonb)`, [], /once/)
    await expectOk(`select public.set_setting('standards', '[{"code":"NSCP 2015","title":"National Structural Code of the Philippines"},{"code":"PEC 2017","title":"Philippine Electrical Code"}]'::jsonb)`)
    await expectFail("select public.set_setting('access.inactive_days', '7'::jsonb)", [], /14 to 365/)
    await expectOk("select public.set_setting('access.inactive_days', '45'::jsonb)")
    await asOwner()
    if ((await value("standards")).length !== 2) throw new Error("standards not stored")
  })

  await test("The inactive-accounts report needs users.view and lists only active staff and clients who have not signed in", async () => {
    await asOwner()
    await addUser("idle1", "foreman")
    await addUser("idle2", "client")
    await addUser("recent1", "engineer")
    await db.query("update auth.users set last_sign_in_at = now() - interval '90 days' where id = $1", [ids.idle1])
    await db.query("update auth.users set last_sign_in_at = null where id = $1", [ids.idle2])
    await db.query("update public.profiles set created_at = now() - interval '200 days' where id = $1", [ids.idle2])
    await db.query("update auth.users set last_sign_in_at = now() - interval '2 days' where id = $1", [ids.recent1])
    await as("eng1")
    await expectFail("select * from public.get_inactive_users()", [], /users.view/)
    await as("noperm", "aal2")
    await expectFail("select * from public.get_inactive_users()", [], /users.view/)
    await as("admin", "aal2")
    const rows = (await db.query("select * from public.get_inactive_users()")).rows
    const names = rows.map((row) => row.id)
    if (!names.includes(ids.idle1) || !names.includes(ids.idle2)) throw new Error("idle accounts missing: " + JSON.stringify(rows.map((r) => r.email)))
    if (names.includes(ids.recent1)) throw new Error("a recent sign-in is listed")
    if (rows.some((row) => row.role === "admin" || row.role === "super_admin")) throw new Error("admins must not be listed")
    const idle1 = rows.find((row) => row.id === ids.idle1)
    if (idle1.days_inactive < 89 || idle1.days_inactive > 91) throw new Error("days_inactive wrong: " + idle1.days_inactive)
    const wide = (await db.query("select * from public.get_inactive_users(365)")).rows
    if (wide.some((row) => row.id === ids.idle1)) throw new Error("the day limit is ignored")
    await asOwner()
    await db.query("update public.profiles set status = 'disabled' where id = $1", [ids.idle1])
    await as("admin", "aal2")
    if ((await db.query("select * from public.get_inactive_users()")).rows.some((row) => row.id === ids.idle1)) throw new Error("a disabled account is listed")
  })
}
