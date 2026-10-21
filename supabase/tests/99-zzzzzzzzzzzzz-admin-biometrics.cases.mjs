import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

export default async function ({
  db,
  ids,
  as,
  asOwner,
  addUser,
  test,
  expectFail,
}) {
  await asOwner()
  await addUser("biometricAdmin", "admin")
  await addUser("biometricForeman", "foreman")
  const project = (
    await db.query(
      "insert into public.projects(code,name) values('BIO-ADMIN','Admin enrollment access') returning id",
    )
  ).rows[0].id
  const worker = randomUUID(),
    device = randomUUID()
  await db.query(
    "insert into public.project_members(project_id,user_id) values($1,$2)",
    [project, ids.biometricForeman],
  )
  // A stray permission row must never authorize a Foreman to enroll workers.
  await db.query(
    "insert into public.admin_permissions(user_id,permission) values($1,'biometrics.manage'),($2,'biometrics.manage') on conflict do nothing",
    [ids.biometricAdmin, ids.biometricForeman],
  )
  await test("Biometric enrollment: Admin with MFA creates and edits workers and devices", async () => {
    await as("biometricAdmin", "aal2")
    await db.query(
      "insert into public.attendance_workers(id,project_id,worker_code,biometric_uid,full_name) values($1,$2,'ADMIN-001','11','Admin Registered Worker')",
      [worker, project],
    )
    assert.equal(
      (
        await db.query(
          "update public.attendance_workers set biometric_uid='12' where id=$1 returning id",
          [worker],
        )
      ).rows.length,
      1,
    )
    await db.query(
      "insert into public.attendance_devices(id,project_id,label,token_sha256) values($1,$2,'Admin gate',$3)",
      [device, project, "a".repeat(64)],
    )
    assert.equal(
      (
        await db.query(
          "update public.attendance_devices set active=false where id=$1 returning id",
          [device],
        )
      ).rows.length,
      1,
    )
  })
  await test("Biometric enrollment: MFA and permission are required, with no Foreman delegation", async () => {
    for (const [who, aal] of [
      ["biometricAdmin", "aal1"],
      ["noperm", "aal2"],
      ["biometricForeman", "aal2"],
    ]) {
      await as(who, aal)
      assert.equal(
        (await db.query("select public.has_permission('biometrics.manage') ok"))
          .rows[0].ok,
        false,
      )
      await expectFail(
        "insert into public.attendance_workers(project_id,worker_code,biometric_uid,full_name) values($1,'DENIED','13','Not authorized')",
        [project],
        /row-level security/,
      )
      assert.equal(
        (
          await db.query(
            "update public.attendance_workers set biometric_uid='99',active=false where id=$1 returning id",
            [worker],
          )
        ).rows.length,
        0,
      )
      assert.equal(
        (
          await db.query(
            "update public.attendance_devices set active=true where id=$1 returning id",
            [device],
          )
        ).rows.length,
        0,
      )
      await expectFail(
        "insert into storage.objects(bucket_id,name) values('worker-photos',$1)",
        [`${project}/${worker}/denied.jpg`],
        /row-level security/,
      )
    }
    await as("biometricForeman", "aal2")
    assert.equal(
      (
        await db.query(
          "select biometric_uid,active from public.attendance_workers where id=$1",
          [worker],
        )
      ).rows[0].biometric_uid,
      "12",
    )
    assert.equal(
      (
        await db.query("select id from public.attendance_devices where id=$1", [
          device,
        ])
      ).rows.length,
      0,
    )
  })
}
