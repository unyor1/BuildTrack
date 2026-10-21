import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

export default async function ({ db, ids, as, asOwner, addUser, test, expectFail }) {
  await asOwner()
  await addUser("enrollAdmin", "admin")
  await addUser("enrollFore", "foreman")
  await db.query("insert into public.admin_permissions(user_id,permission) values($1,'biometrics.manage') on conflict do nothing", [ids.enrollAdmin])
  const project = (await db.query("insert into public.projects(code,name) values('SENSOR-ENROLL','Sensor enrollment test') returning id")).rows[0].id
  const other = (await db.query("insert into public.projects(code,name) values('SENSOR-OTHER','Other sensor project') returning id")).rows[0].id
  const device = randomUUID(), secondDevice = randomUUID(), foreignDevice = randomUUID()
  const first = randomUUID(), second = randomUUID(), third = randomUUID()
  const hash = "a".repeat(64)
  await db.query("insert into public.project_members(project_id,user_id) values($1,$2)", [project, ids.enrollFore])
  await as("enrollAdmin", "aal2")
  for (const [id, code] of [[first, "E-001"], [second, "E-002"], [third, "E-003"]]) await db.query("insert into public.attendance_workers(id,project_id,worker_code,full_name,first_name,last_name,middle_initial,contact_number,email) values($1,$2,$3,'Juan A. Cruz','Juan','Cruz','A','09123456789','juan@example.com')", [id, project, code])
  for (const [id, site] of [[device, project], [secondDevice, project], [foreignDevice, other]]) await db.query("insert into public.attendance_devices(id,project_id,label,token_sha256) values($1,$2,'Test enrollment device',$3)", [id, site, hash])
  const admin = () => as("enrollAdmin", "aal2")
  const service = async () => { await asOwner(); await db.exec("set role service_role") }
  const request = async (worker, reader = device) => { await admin(); return (await db.query("select public.request_worker_enrollment($1,$2) id", [worker, reader])).rows[0].id }
  const process = async (action, job = null, reader = device, capacity = 20, credential = hash) => {
    await service()
    return (await db.query("select public.process_worker_enrollment($1,$2,$3,$4,$5,'Sensor capture failed') result", [reader, credential, action, action === "poll" ? capacity : null, job])).rows[0].result
  }
  let job
  await test("Enrollment: split names/contact/email persist; new workers have no manual fingerprint ID", async () => {
    await admin()
    const worker = (await db.query("select * from public.attendance_workers where id=$1", [first])).rows[0]
    assert.equal(worker.biometric_uid, null)
    assert.equal(worker.first_name, "Juan"); assert.equal(worker.last_name, "Cruz")
    assert.equal(worker.middle_initial, "A"); assert.equal(worker.contact_number, "09123456789")
    assert.equal(worker.email, "juan@example.com")
    await expectFail("update public.attendance_workers set email='invalid email' where id=$1", [first], /check constraint/)
    await expectFail("update public.attendance_workers set fingerprint_enrolled_at=now() where id=$1", [first], /permission denied/)
  })
  await test("Enrollment: Admin starts one pending job per worker/device; wrong-project devices fail", async () => {
    job = await request(first)
    await expectFail("select public.request_worker_enrollment($1,$2)", [second, device], /already pending/)
    await expectFail("select public.request_worker_enrollment($1,$2)", [first, secondDevice], /already pending/)
    await expectFail("select public.request_worker_enrollment($1,$2)", [second, foreignDevice], /device project/)
    await expectFail("update public.worker_enrollment_requests set status='completed' where id=$1", [job], /permission denied/)
  })
  await test("Enrollment: Foreman/Engineer/Client/no-MFA/anonymous cannot request, cancel or confirm", async () => {
    for (const [who, aal] of [["enrollFore", "aal2"], ["eng1", "aal2"], ["client1", "aal2"], ["noperm", "aal2"], ["enrollAdmin", "aal1"]]) {
      await as(who, aal)
      await expectFail("select public.request_worker_enrollment($1,$2)", [second, secondDevice], /Admin biometric/)
      await expectFail("select public.cancel_worker_enrollment($1)", [job], /Admin biometric/)
      await expectFail("select public.process_worker_enrollment($1,$2,'completed',null,$3,'')", [device, hash, job], /permission denied/)
      if (who === "enrollFore") assert.equal((await db.query("select id from public.worker_enrollment_requests where id=$1", [job])).rows.length, 0)
    }
    await as(null)
    await expectFail("select public.request_worker_enrollment($1,$2)", [second, device], /permission denied/)
  })
  await test("Enrollment: device authentication, automatic slot assignment and idempotent poll/completion", async () => {
    await expectFailAfterService(device, "b".repeat(64), "poll", null, /Invalid or revoked/)
    const poll = await process("poll")
    assert.equal(poll.job.id, job); assert.equal(poll.job.slot, 1)
    assert.deepEqual((await process("poll")).job, poll.job)
    await expectFailAfterService(secondDevice, hash, "completed", job, /does not belong/)
    assert.equal((await process("completed", job)).acknowledged, true)
    assert.equal((await process("completed", job)).acknowledged, true)
    await admin()
    const worker = (await db.query("select biometric_uid,enrolled_device_id,fingerprint_enrolled_at from public.attendance_workers where id=$1", [first])).rows[0]
    assert.equal(worker.biometric_uid, "1"); assert.equal(worker.enrolled_device_id, device)
    assert.ok(worker.fingerprint_enrolled_at)
    await expectFail("select public.request_worker_enrollment($1,$2)", [first, device], /already has/)
  })
  async function expectFailAfterService(reader, credential, action, requestId, pattern) {
    await service()
    await expectFail("select public.process_worker_enrollment($1,$2,$3,20,$4,'')", [reader, credential, action, requestId], pattern)
  }
  await test("Enrollment: cancelled/interrupted slots stay reserved; no false successful mapping", async () => {
    const cancelled = await request(second)
    assert.equal((await process("poll")).job.slot, 2)
    await admin(); await db.query("select public.cancel_worker_enrollment($1)", [cancelled])
    assert.equal((await process("completed", cancelled)).discarded, true)
    const failed = await request(second)
    assert.equal((await process("poll")).job.slot, 3)
    assert.equal((await process("failed", failed)).acknowledged, true)
    assert.equal((await process("failed", failed)).acknowledged, true)
    await admin()
    assert.equal((await db.query("select biometric_uid from public.attendance_workers where id=$1", [second])).rows[0].biometric_uid, null)
    const next = await request(second)
    assert.equal((await process("poll")).job.slot, 4)
    await asOwner(); await db.query("update public.worker_enrollment_requests set expires_at=now()-interval '1 second' where id=$1", [next])
    assert.equal((await process("completed", next)).discarded, true)
  })
  await test("Enrollment: revoked Admin, inactive worker, full capacity and revoked device fail closed", async () => {
    const blocked = await request(third)
    await asOwner(); await db.query("delete from public.admin_permissions where user_id=$1 and permission='biometrics.manage'", [ids.enrollAdmin])
    assert.equal((await process("poll")).job, null)
    await asOwner()
    assert.equal((await db.query("select status from public.worker_enrollment_requests where id=$1", [blocked])).rows[0].status, "failed")
    await db.query("insert into public.admin_permissions(user_id,permission) values($1,'biometrics.manage')", [ids.enrollAdmin])
    await request(third)
    assert.equal((await process("poll", null, device, 4)).job, null, "All four allocated slots remain reserved")
    await request(third)
    await asOwner(); await db.query("update public.attendance_workers set active=false where id=$1", [third])
    assert.equal((await process("poll")).job, null)
    await asOwner(); await db.query("update public.attendance_devices set active=false where id=$1", [device])
    await expectFailAfterService(device, hash, "poll", null, /Invalid or revoked/)
  })
  await test("Enrollment: attendance accepts only the device that holds the new worker fingerprint", async () => {
    await service()
    await expectFail("select public.ingest_biometric_device_event($1,$2,'1','in',now(),'wrong-device')", [secondDevice, hash], /another device/)
    await asOwner(); await db.query("update public.attendance_devices set active=true where id=$1", [device])
    await service()
    assert.ok((await db.query("select public.ingest_biometric_device_event($1,$2,'1','in',now(),'correct-device') id", [device, hash])).rows[0].id)
  })
}
