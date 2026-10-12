// Tests for 0030: identity verification (ID upload + admin review), elevated access gated by it, privacy consent records.
export default async function ({ db, ids, as, asOwner, test, expectOk, expectFail, count, addUser }) {
  await asOwner()
  await db.query("delete from public.admin_permissions where user_id = $1", [ids.admin])
  await db.query("insert into public.admin_permissions (user_id, permission) values ($1, 'users.approve'), ($1, 'users.view') on conflict do nothing", [ids.admin])
  await addUser("idu", "user", "active", false)
  await addUser("idu2", "user", "active", false)
  const confirm = async (key) => {
    await asOwner()
    await db.query("update auth.users set email_confirmed_at = now() where id = $1", [ids[key]])
  }
  await confirm("idu")
  await confirm("idu2")
  const file = async (who, name) => {
    await asOwner()
    const path = `${ids[who]}/pending/${name}.jpg`
    await db.query("insert into storage.objects (bucket_id, name, owner) values ('identity-docs', $1, $2)", [path, ids[who]])
    return path
  }
  const submit = async (who, over = {}) => {
    const front = over.front ?? (await file(who, "front" + Math.random().toString(36).slice(2, 7)))
    const selfie = over.selfie ?? (await file(who, "selfie" + Math.random().toString(36).slice(2, 7)))
    await as(who)
    const args = { name: "Ida Dela Cruz", birth: "1990-05-17", address: "12 Mabini St, Valenzuela City", phone: "+63 912 345 6789", type: "philsys", last4: "4821", expiry: null, back: null, consent: "2026-10", ...over }
    return db.query("select public.submit_identity_verification($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) id", [args.name, args.birth, args.address, args.phone, args.type, args.last4, args.expiry, front, args.back, selfie, args.consent])
  }
  let vid

  await test("A new email sign-up starts unverified; people who existed before are verified", async () => {
    await asOwner()
    if ((await db.query("select identity_status from public.profiles where id = $1", [ids.idu])).rows[0].identity_status !== "unverified") throw new Error("new account should be unverified")
    if ((await db.query("select identity_status from public.profiles where id = $1", [ids.eng1])).rows[0].identity_status !== "verified") throw new Error("existing accounts must stay verified")
  })

  await test("Elevated access is refused until the identity is verified (request and invitation code)", async () => {
    await as("idu")
    await expectFail("insert into public.access_requests (user_id, requested_role) values ($1, 'engineer')", [ids.idu], /Verify your identity first/)
    await asOwner()
    await db.query("insert into public.invite_codes (code, assigned_role, max_uses, expires_at, created_by) values ('AB12CD34EF56', 'client', 1, now() + interval '1 day', $1)", [ids.super])
    await as("idu")
    const r = (await db.query("select public.redeem_invite('AB12CD34EF56') r")).rows[0].r
    if (r.ok !== false || r.reason !== "not_verified") throw new Error("invite must need verification: " + JSON.stringify(r))
  })

  await test("Submitting needs valid details, an adult, an unexpired ID and files inside the person's own folder", async () => {
    const own = await file("idu", "own")
    const other = await file("idu2", "other")
    await as("idu")
    await expectFail("select public.submit_identity_verification('Ida', '2015-01-01', '12 Mabini St, Valenzuela', '+63 912 345 6789', 'philsys', '4821', null, $1, null, $1, '2026-10')", [own], /at least 18/)
    await expectFail("select public.submit_identity_verification('Ida', '1990-01-01', 'short', '+63 912 345 6789', 'philsys', '4821', null, $1, null, $1, '2026-10')", [own], /check/)
    await expectFail("select public.submit_identity_verification('Ida', '1990-01-01', '12 Mabini St, Valenzuela', '+63 912 345 6789', 'library_card', '4821', null, $1, null, $1, '2026-10')", [own], /check/)
    await expectFail("select public.submit_identity_verification('Ida', '1990-01-01', '12 Mabini St, Valenzuela', '+63 912 345 6789', 'philsys', '12', null, $1, null, $1, '2026-10')", [own], /check/)
    await expectFail("select public.submit_identity_verification('Ida', '1990-01-01', '12 Mabini St, Valenzuela', '+63 912 345 6789', 'philsys', '4821', '2020-01-01', $1, null, $1, '2026-10')", [own], /expired/)
    await expectFail("select public.submit_identity_verification('Ida', '1990-01-01', '12 Mabini St, Valenzuela', '+63 912 345 6789', 'philsys', '4821', null, $1, null, $1, '')", [own], /privacy notice/)
    await expectFail("select public.submit_identity_verification('Ida', '1990-01-01', '12 Mabini St, Valenzuela', '+63 912 345 6789', 'philsys', '4821', null, $1, null, $2, '2026-10')", [own, other], /own folder/)
    await expectFail("select public.submit_identity_verification('Ida', '1990-01-01', '12 Mabini St, Valenzuela', '+63 912 345 6789', 'philsys', '4821', null, $1, null, $2, '2026-10')", [own, `${ids.idu}/pending/never-uploaded.jpg`], /not uploaded/)
  })

  await test("A valid submission is stored, the profile becomes pending, consent and audit are recorded, reviewers are told", async () => {
    const result = await submit("idu")
    vid = result.rows[0].id
    await asOwner()
    if ((await db.query("select identity_status from public.profiles where id = $1", [ids.idu])).rows[0].identity_status !== "pending") throw new Error("profile not pending")
    const row = (await db.query("select * from public.identity_verifications where id = $1", [vid])).rows[0]
    if (row.status !== "submitted" || row.id_last4 !== "4821" || row.consent_version !== "2026-10") throw new Error("bad row " + JSON.stringify(row))
    if ((await count("select count(*) n from public.privacy_consents where user_id = $1 and scope = 'identity'", [ids.idu])) !== 1) throw new Error("consent not recorded")
    if ((await count("select count(*) n from public.audit_log where action = 'identity.submit' and target_id = $1", [ids.idu])) !== 1) throw new Error("not audited")
    const told = (await db.query("select user_id from public.notifications where kind = 'identity.new'")).rows.map((r) => r.user_id)
    if (!told.includes(ids.super) || !told.includes(ids.admin)) throw new Error("reviewers not told")
    await as("idu")
    await expectFail("select public.submit_identity_verification('Ida', '1990-01-01', '12 Mabini St, Valenzuela', '+63 912 345 6789', 'philsys', '4821', null, $1, null, $1, '2026-10')", [`${ids.idu}/pending/x.jpg`], /already verified or waiting/)
  })

  await test("Only the owner and reviewing admins can read the submission; nobody can write it directly", async () => {
    await as("idu")
    if ((await count("select count(*) n from public.identity_verifications")) !== 1) throw new Error("owner cannot read")
    await expectFail("update public.identity_verifications set status = 'approved'", [], /permission denied/)
    await expectFail("insert into public.identity_verifications (user_id, legal_name) values ($1, 'x')", [ids.idu], /permission denied/)
    for (const who of ["idu2", "eng1", "fore1", "client1"]) {
      await as(who)
      if ((await count("select count(*) n from public.identity_verifications")) !== 0) throw new Error(who + " reads someone's ID details")
    }
    await as("admin", "aal2")
    if ((await count("select count(*) n from public.identity_verifications")) !== 1) throw new Error("reviewing admin cannot read")
    await as("admin", "aal1")
    if ((await count("select count(*) n from public.identity_verifications")) !== 0) throw new Error("admin without MFA reads IDs")
  })

  await test("ID images are private: owner and reviewing admins read them, others do not; the owner cannot delete a submitted image", async () => {
    await asOwner()
    const front = (await db.query("select front_path from public.identity_verifications where id = $1", [vid])).rows[0].front_path
    await as("idu")
    if ((await count("select count(*) n from storage.objects where bucket_id = 'identity-docs' and name = $1", [front])) !== 1) throw new Error("owner cannot read own image")
    for (const who of ["idu2", "eng1", "client1"]) {
      await as(who)
      if ((await count("select count(*) n from storage.objects where bucket_id = 'identity-docs' and name = $1", [front])) !== 0) throw new Error(who + " can see someone's ID image")
    }
    await as("admin", "aal2")
    if ((await count("select count(*) n from storage.objects where bucket_id = 'identity-docs' and name = $1", [front])) !== 1) throw new Error("reviewing admin cannot read")
    await as("idu")
    const removed = await db.query("delete from storage.objects where bucket_id = 'identity-docs' and name = $1 returning id", [front])
    if (removed.rows.length) throw new Error("owner deleted a submitted image")
    await as("idu2")
    await expectFail("insert into storage.objects (bucket_id, name, owner) values ('identity-docs', $1, $2)", [`${ids.idu}/pending/forged.jpg`, ids.idu2], /row-level security/)
  })

  await test("Reviewing: opening is audited, only users.approve decides, rejection needs a reason, nobody verifies themselves", async () => {
    await as("eng1")
    await expectFail("select public.decide_identity_verification($1, true)", [vid], /Missing permission/)
    await expectFail("select public.record_identity_view($1)", [vid], /Missing permission/)
    await asOwner()
    await addUser("viewonly", "admin")
    await asOwner()
    await db.query("delete from public.admin_permissions where user_id = $1", [ids.viewonly])
    await db.query("insert into public.admin_permissions (user_id, permission) values ($1, 'users.view')", [ids.viewonly])
    await as("viewonly", "aal2")
    await expectFail("select public.decide_identity_verification($1, true)", [vid], /Missing permission/)
    await as("admin", "aal2")
    await expectOk("select public.record_identity_view($1)", [vid])
    await asOwner()
    if ((await count("select count(*) n from public.audit_log where action = 'identity.view' and actor_id = $1", [ids.admin])) < 1) throw new Error("view not audited")
    await as("admin", "aal2")
    await expectFail("select public.decide_identity_verification($1, false, 'no')", [vid], /at least 5/)
    await expectOk("select public.decide_identity_verification($1, false, 'The photo of the ID is blurry, please retake it')", [vid])
    await asOwner()
    if ((await db.query("select identity_status from public.profiles where id = $1", [ids.idu])).rows[0].identity_status !== "rejected") throw new Error("not rejected")
    const told = (await db.query("select * from public.notifications where user_id = $1 and kind = 'identity.rejected'", [ids.idu])).rows
    if (told.length !== 1 || !/blurry/.test(told[0].body)) throw new Error("person not told why")
    await as("admin", "aal2")
    await expectFail("select public.decide_identity_verification($1, true)", [vid], /already decided/)
  })

  await test("After a rejection the person can correct and send again; approval verifies, notifies and unlocks elevated access", async () => {
    await as("idu")
    await expectFail("insert into public.access_requests (user_id, requested_role) values ($1, 'engineer')", [ids.idu], /Verify your identity first/)
    const again = await submit("idu", { name: "Ida M. Dela Cruz" })
    const v2 = again.rows[0].id
    await as("admin", "aal2")
    await expectOk("select public.decide_identity_verification($1, true, 'Documents match')", [v2])
    await asOwner()
    const p = (await db.query("select identity_status, identity_verified_at from public.profiles where id = $1", [ids.idu])).rows[0]
    if (p.identity_status !== "verified" || !p.identity_verified_at) throw new Error("not verified")
    if ((await count("select count(*) n from public.notifications where user_id = $1 and kind = 'identity.approved'", [ids.idu])) !== 1) throw new Error("not told")
    if ((await count("select count(*) n from public.audit_log where action in ('identity.approve', 'identity.reject') and target_id = $1", [ids.idu])) !== 2) throw new Error("decisions not audited")
    await as("idu")
    await expectOk("insert into public.access_requests (user_id, requested_role) values ($1, 'engineer')", [ids.idu])
    await as("idu")
    await expectFail("select public.withdraw_identity_verification($1)", [v2], /still waiting/)
  })

  await test("An administrator cannot verify their own identity; a person can withdraw a waiting submission", async () => {
    await addUser("selfadmin", "admin", "active", false)
    await asOwner()
    await db.query("insert into public.admin_permissions (user_id, permission) values ($1, 'users.approve') on conflict do nothing", [ids.selfadmin])
    await db.query("update public.profiles set identity_status = 'unverified' where id = $1", [ids.selfadmin])
    const result = await submit("selfadmin")
    await as("selfadmin", "aal2")
    await expectFail("select public.decide_identity_verification($1, true)", [result.rows[0].id], /your own identity/)
    await as("selfadmin")
    await expectOk("select public.withdraw_identity_verification($1)", [result.rows[0].id])
    await asOwner()
    if ((await db.query("select identity_status from public.profiles where id = $1", [ids.selfadmin])).rows[0].identity_status !== "unverified") throw new Error("withdraw did not reset")
  })

  await test("Images can be deleted by a reviewing admin after the decision, and that is audited; undecided submissions cannot", async () => {
    await asOwner()
    const decided = (await db.query("select id from public.identity_verifications where status = 'approved' limit 1")).rows[0].id
    const waiting = await submit("idu2")
    await as("admin", "aal2")
    await expectFail("select public.mark_identity_docs_deleted($1)", [waiting.rows[0].id], /decided submission/)
    await expectOk("select public.mark_identity_docs_deleted($1)", [decided])
    await asOwner()
    if ((await count("select count(*) n from public.audit_log where action = 'identity.docs_deleted'")) !== 1) throw new Error("deletion not audited")
    await as("eng1")
    await expectFail("select public.mark_identity_docs_deleted($1)", [decided], /Missing permission/)
  })

  await test("A pending Google sign-up can record the privacy notice; a disabled account cannot", async () => {
    await asOwner()
    const { rows } = await db.query("insert into auth.users (email, raw_user_meta_data, raw_app_meta_data, email_confirmed_at) values ('gpriv@test.local', '{}', '{\"provider\":\"google\"}', now()) returning id")
    ids.gpriv = rows[0].id
    await as("gpriv")
    await expectOk("select public.record_privacy_consent('registration', '2026-10')")
    if ((await count("select count(*) n from public.privacy_consents where user_id = $1", [ids.gpriv])) !== 1) throw new Error("pending person's consent not recorded")
    await asOwner()
    await db.query("update public.profiles set status = 'disabled' where id = $1", [ids.gpriv])
    await as("gpriv")
    await expectFail("select public.record_privacy_consent('profile', '2026-10')", [], /Not signed in/)
  })

  await test("Role grants by an administrator or the whitelist mark the person verified; privacy consent is recorded once per version", async () => {
    await addUser("trusted", "user", "active", false)
    await asOwner()
    await db.query("update public.profiles set role = 'foreman' where id = $1", [ids.trusted])
    if ((await db.query("select identity_status from public.profiles where id = $1", [ids.trusted])).rows[0].identity_status !== "verified") throw new Error("granted role should be trusted")
    await as("trusted")
    await expectOk("select public.record_privacy_consent('profile', '2026-10')")
    await expectOk("select public.record_privacy_consent('profile', '2026-10')")
    await expectFail("select public.record_privacy_consent('gossip', '2026-10')", [], /Unknown privacy scope/)
    if ((await count("select count(*) n from public.privacy_consents where scope = 'profile'")) !== 1) throw new Error("consent duplicated")
    await as("eng1")
    if ((await count("select count(*) n from public.privacy_consents where user_id = $1", [ids.trusted])) !== 0) throw new Error("another person's consent is visible")
    await asOwner()
    const { rows } = await db.query("insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ('consented@test.local', '{\"consent_version\":\"2026-10\"}', now()) returning id")
    if ((await count("select count(*) n from public.privacy_consents where user_id = $1 and scope = 'registration'", [rows[0].id])) !== 1) throw new Error("registration consent not copied from the sign-up")
  })
}
