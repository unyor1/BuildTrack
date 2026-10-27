import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

// 20261027110000_enrollment_progress: the device reports live capture steps; only 'completed' links a worker.
export default async function ({ db, ids, as, asOwner, addUser, test, expectFail }) {
  await asOwner()
  await addUser("progAdmin", "admin")
  await addUser("progFore", "foreman")
  await db.query("insert into public.admin_permissions(user_id,permission) values($1,'biometrics.manage') on conflict do nothing", [ids.progAdmin])
  const project = (await db.query("insert into public.projects(code,name) values('SENSOR-PROGRESS','Enrollment progress test') returning id")).rows[0].id
  const device = randomUUID(), otherDevice = randomUUID()
  const first = randomUUID(), second = randomUUID()
  const hash = "c".repeat(64)
  await db.query("insert into public.project_members(project_id,user_id) values($1,$2)", [project, ids.progFore])
  await as("progAdmin", "aal2")
  for (const [id, code] of [[first, "P-001"], [second, "P-002"]]) await db.query("insert into public.attendance_workers(id,project_id,worker_code,full_name,first_name,last_name) values($1,$2,$3,'Ana Reyes','Ana','Reyes')", [id, project, code])
  for (const id of [device, otherDevice]) await db.query("insert into public.attendance_devices(id,project_id,label,token_sha256) values($1,$2,'Progress device',$3)", [id, project, hash])
  const admin = () => as("progAdmin", "aal2")
  const service = async () => { await asOwner(); await db.exec("set role service_role") }
  const request = async (worker) => { await admin(); return (await db.query("select public.request_worker_enrollment($1,$2) id", [worker, device])).rows[0].id }
  const call = async (action, { job = null, stage = "", reader = device, credential = hash } = {}) => {
    await service()
    return (await db.query("select public.process_worker_enrollment($1,$2,$3,$4,$5,'',$6) result", [reader, credential, action, action === "poll" ? 20 : null, job, stage])).rows[0].result
  }
  const row = async (job) => { await admin(); return (await db.query("select status,stage,stage_at,expires_at from public.worker_enrollment_requests where id=$1", [job])).rows[0] }

  let job
  await test("Enrollment progress: device steps are saved and readable by the Admin; a step never links the worker", async () => {
    job = await request(first)
    assert.equal((await row(job)).stage, "")
    await call("poll")
    for (const stage of ["place_first", "lift", "place_second", "storing", "confirm"]) {
      assert.deepEqual(await call("progress", { job, stage }), { acknowledged: true })
      const current = await row(job)
      assert.equal(current.stage, stage); assert.equal(current.status, "capturing"); assert.ok(current.stage_at)
    }
    await admin()
    assert.equal((await db.query("select biometric_uid from public.attendance_workers where id=$1", [first])).rows[0].biometric_uid, null, "Only completion links the worker")
    assert.equal((await call("completed", { job })).acknowledged, true)
    assert.equal((await row(job)).status, "completed")
  })

  await test("Enrollment progress: wrong stage, wrong device, wrong token and website users are refused", async () => {
    const pending = await request(second)
    await call("poll")
    await service()
    await expectFail("select public.process_worker_enrollment($1,$2,'progress',null,$3,'','scan_anything')", [device, hash, pending], /Invalid enrollment stage/)
    await expectFail("select public.process_worker_enrollment($1,$2,'progress',null,$3,'',null)", [device, hash, pending], /Invalid enrollment stage/)
    await expectFail("select public.process_worker_enrollment($1,$2,'progress',null,$3,'','lift')", [otherDevice, hash, pending], /does not belong/)
    await expectFail("select public.process_worker_enrollment($1,$2,'progress',null,$3,'','lift')", [device, "d".repeat(64), pending], /Invalid or revoked/)
    for (const who of ["progAdmin", "progFore"]) {
      await as(who, "aal2")
      await expectFail("select public.process_worker_enrollment($1,$2,'progress',null,$3,'','lift')", [device, hash, pending], /permission denied/)
      await expectFail("update public.worker_enrollment_requests set stage='confirm' where id=$1", [pending], /permission denied/)
    }
    await as("progFore", "aal2")
    assert.equal((await db.query("select stage from public.worker_enrollment_requests where id=$1", [pending])).rows.length, 0, "Foremen never read enrollment jobs")
    await admin(); await db.query("select public.cancel_worker_enrollment($1)", [pending])
  })

  await test("Enrollment progress: a cancelled job tells the device to stop; an active step extends the deadline (max 10 minutes)", async () => {
    await asOwner(); await db.query("update public.attendance_workers set biometric_uid=null where id=$1", [second])
    const cancelled = (await db.query("select id from public.worker_enrollment_requests where worker_id=$1 and status='cancelled'", [second])).rows[0].id
    assert.deepEqual(await call("progress", { job: cancelled, stage: "lift" }), { acknowledged: true, discarded: true })
    assert.equal((await row(cancelled)).stage, "", "A cancelled job keeps its last step")

    const active = await request(second)
    await call("poll")
    await asOwner(); await db.query("update public.worker_enrollment_requests set expires_at=clock_timestamp()+interval '5 seconds' where id=$1", [active])
    await call("progress", { job: active, stage: "place_first" })
    const extended = await row(active)
    assert.ok(new Date(extended.expires_at) - Date.now() > 60_000, "Deadline moved about 90 s ahead")
    await asOwner(); await db.query("update public.worker_enrollment_requests set created_at=clock_timestamp()-interval '9 minutes 50 seconds', expires_at=clock_timestamp()+interval '5 seconds' where id=$1", [active])
    await call("progress", { job: active, stage: "lift" })
    assert.ok(new Date((await row(active)).expires_at) - Date.now() < 15_000, "Never beyond 10 minutes after the request")
    await asOwner(); await db.query("update public.worker_enrollment_requests set expires_at=clock_timestamp()-interval '1 second' where id=$1", [active])
    assert.deepEqual(await call("progress", { job: active, stage: "storing" }), { acknowledged: true, discarded: true })
    assert.equal((await row(active)).status, "failed", "An expired job fails instead of continuing")
  })

  await test("Enrollment progress: the six-argument call used by the deployed receiver still works", async () => {
    await service()
    const result = (await db.query("select public.process_worker_enrollment($1,$2,'poll',20,null,'') result", [device, hash])).rows[0].result
    assert.deepEqual(result, { job: null })
    await asOwner()
    const sigs = (await db.query("select p.oid::regprocedure::text sig from pg_proc p where proname='process_worker_enrollment'")).rows.map((r) => r.sig)
    assert.deepEqual(sigs, ["process_worker_enrollment(uuid,text,text,integer,uuid,text,text)"], "One function, no ambiguous overload")
  })
}
