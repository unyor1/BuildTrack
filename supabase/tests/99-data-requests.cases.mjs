// Tests for 0032: "delete my data" requests (right to erasure).
export default async function ({ db, ids, as, asOwner, test, expectFail, count, addUser }) {
  await asOwner()
  await db.query("insert into public.admin_permissions (user_id, permission) values ($1, 'users.approve'), ($1, 'users.view') on conflict do nothing", [ids.admin])
  await addUser("dr1", "client", "active", true)
  await addUser("dr2", "foreman", "active", true)
  let rid

  await test("A person can ask to delete their data once; admins with users.approve are told", async () => {
    await as("dr1")
    rid = (await db.query("select public.request_data_erasure('I no longer work with this company') id")).rows[0].id
    await expectFail("select public.request_data_erasure(null)", [], /already have a request/)
    await asOwner()
    if ((await count("select count(*) n from public.notifications where kind = 'privacy.erasure' and entity_id = $1", [rid])) < 1) throw new Error("admins were not notified")
    if ((await count("select count(*) n from public.audit_log where action = 'privacy.erasure_requested' and target_id = $1", [ids.dr1])) !== 1) throw new Error("request not audited")
  })

  await test("Reading: owner and reviewing admins see it; others do not; nobody writes the table", async () => {
    await as("dr1")
    if ((await count("select count(*) n from public.data_requests")) !== 1) throw new Error("owner should see their request")
    await as("dr2")
    if ((await count("select count(*) n from public.data_requests")) !== 0) throw new Error("another person must not see it")
    await as("admin", "aal2")
    if ((await count("select count(*) n from public.data_requests")) !== 1) throw new Error("reviewing admin should see it")
    await as("dr1")
    await expectFail("update public.data_requests set status = 'done' where id = $1", [rid], /permission denied/)
    await expectFail("insert into public.data_requests (user_id) values ($1)", [ids.dr1], /permission denied/)
  })

  await test("Administrators cannot use the request, and the erase function is service-role only", async () => {
    await as("admin", "aal2")
    await expectFail("select public.request_data_erasure(null)", [], /Administrator accounts/)
    for (const who of ["dr1", "admin", "super"]) {
      await as(who, "aal2")
      await expectFail("select public.erase_user_data($1, $2, $3)", [ids.dr1, rid, ids.admin], /permission denied/)
    }
  })

  await test("Declining needs the permission and a reason; the person is told", async () => {
    await as("dr2")
    await expectFail("select public.decline_data_request($1, 'because')", [rid], /Missing permission/)
    await as("admin", "aal2")
    await expectFail("select public.decline_data_request($1, 'no')", [rid], /at least 5/)
    await db.query("select public.decline_data_request($1, 'Open safety case, records must stay')", [rid])
    await expectFail("select public.decline_data_request($1, 'Open safety case again')", [rid], /already decided/)
    await asOwner()
    if ((await count("select count(*) n from public.notifications where user_id = $1 and kind = 'privacy.declined'", [ids.dr1])) !== 1) throw new Error("person not told")
  })

  await test("Withdrawing works only for the owner while waiting", async () => {
    await as("dr1")
    const second = (await db.query("select public.request_data_erasure(null) id")).rows[0].id
    await as("dr2")
    await expectFail("select public.withdraw_data_request($1)", [second], /Only a request that is still waiting/)
    await as("dr1")
    await db.query("select public.withdraw_data_request($1)", [second])
    await expectFail("select public.withdraw_data_request($1)", [second], /Only a request that is still waiting/)
  })

  await test("Erasing clears personal data, closes the account and keeps the audit trail", async () => {
    await as("dr1")
    rid = (await db.query("select public.request_data_erasure(null) id")).rows[0].id
    await asOwner()
    await db.query("update public.profiles set phone = '+63 912 345 6789', company = 'ACME', position = 'Owner rep' where id = $1", [ids.dr1])
    await db.query("insert into public.notifications (user_id, kind, title, body) values ($1, 'x.test', 'hello', 'body')", [ids.dr1])
    await db.query(
      "insert into public.identity_verifications (user_id, status, legal_name, birth_date, address, phone, id_type, id_last4, front_path, selfie_path, consent_version) values ($1, 'approved', 'Dina Real', '1990-01-01', '12 Mabini St, Valenzuela', '+63 912 345 6789', 'philsys', '1234', $2, $3, '2026-10')",
      [ids.dr1, `${ids.dr1}/front.jpg`, `${ids.dr1}/selfie.jpg`],
    )
    await db.exec("set role service_role")
    const result = (await db.query("select public.erase_user_data($1, $2, $3) r", [ids.dr1, rid, ids.admin])).rows[0].r
    await asOwner()
    if (result.paths.length !== 2) throw new Error("expected 2 file paths, got " + JSON.stringify(result))
    const p = (await db.query("select full_name, email, phone, company, position, status, identity_status from public.profiles where id = $1", [ids.dr1])).rows[0]
    if (p.full_name !== "Deleted account" || p.phone || p.company || p.position || p.status !== "disabled" || p.identity_status !== "unverified" || !p.email.endsWith("@erased.invalid")) throw new Error("profile not cleared: " + JSON.stringify(p))
    if ((await count("select count(*) n from public.identity_verifications where user_id = $1", [ids.dr1])) !== 0) throw new Error("identity rows left")
    if ((await count("select count(*) n from public.notifications where user_id = $1", [ids.dr1])) !== 0) throw new Error("notifications left")
    if ((await count("select count(*) n from public.data_requests where id = $1 and status = 'done'", [rid])) !== 1) throw new Error("request not closed")
    if ((await count("select count(*) n from public.audit_log where action = 'privacy.erased' and target_id = $1", [ids.dr1])) !== 1) throw new Error("erasure not audited")
    await db.exec("set role service_role")
    await expectFail("select public.erase_user_data($1, $2, $3)", [ids.dr1, rid, ids.admin], /No open request/)
  })

  await test("An administrator account can never be erased", async () => {
    await asOwner()
    const forged = (await db.query("insert into public.data_requests (user_id) values ($1) returning id", [ids.noperm])).rows[0].id
    await db.exec("set role service_role")
    await expectFail("select public.erase_user_data($1, $2, $3)", [ids.noperm, forged, ids.admin], /cannot be erased/)
  })
}
