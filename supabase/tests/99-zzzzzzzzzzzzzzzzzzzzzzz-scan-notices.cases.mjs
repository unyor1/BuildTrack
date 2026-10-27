import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

// 20261027150000_attendance_scan_notices: scans that cannot count are answered and logged (never attendance, never an
// error that would stop the scanner); the attendance screen can read them and hears about them live.
export default async function ({ db, ids, as, asOwner, addUser, test, expectFail }) {
  await asOwner()
  await addUser("noticeFore", "foreman")
  await addUser("noticeClient", "client")
  const project = (await db.query("insert into public.projects(code,name) values('NOTICE-1','Scan notice test') returning id")).rows[0].id
  for (const who of ["noticeFore", "noticeClient"]) await db.query("insert into public.project_members(project_id,user_id) values($1,$2)", [project, ids[who]])
  const gate = randomUUID(), second = randomUUID(), hash = "9".repeat(64)
  for (const id of [gate, second]) await db.query("insert into public.attendance_devices(id,project_id,label,token_sha256) values($1,$2,'Gate',$3)", [id, project, hash])
  const active = randomUUID(), retired = randomUUID(), elsewhere = randomUUID()
  for (const [id, uid, code, on, device] of [[active, "21", "N-1", true, gate], [retired, "22", "N-2", false, gate], [elsewhere, "23", "N-3", true, second]])
    await db.query("insert into public.attendance_workers(id,project_id,worker_code,biometric_uid,full_name,active,enrolled_device_id) values($1,$2,$3,$4,'Notice Worker',$5,$6)", [id, project, code, uid, on, device])
  const service = async () => { await asOwner(); await db.exec("set role service_role") }
  const at = (hhmm) => `2026-04-01T${hhmm}:00+08:00`
  const ingest = async (uid, time, event, reader = gate) => { await service(); return (await db.query("select public.ingest_biometric_scan($1,$2,$3,$4,$5) r", [reader, hash, uid, time, event])).rows[0].r }
  const unmatched = async (time, event, reader = gate) => { await service(); return (await db.query("select public.report_unregistered_scan($1,$2,$3,$4) r", [reader, hash, time, event])).rows[0].r }
  const count = async (table) => { await asOwner(); return (await db.query(`select count(*)::int n from public.${table} where project_id=$1`, [project])).rows[0].n }

  await test("Scan notices: an unknown finger is logged as not registered, idempotent per source event, never attendance", async () => {
    const first = await unmatched(at("07:00"), "nm-1")
    assert.deepEqual(first, { event_id: null, status: "unregistered", reason: "no_match", occurred_at: first.occurred_at })
    assert.deepEqual(await unmatched(at("07:00"), "nm-1"), first, "A retry gets the same answer")
    await service()
    await expectFail("select public.report_unregistered_scan($1,$2,$3,'nm-1')", [gate, hash, at("07:05")], /different scan details/)
    await expectFail("select public.report_unregistered_scan($1,$2,$3,'nm-x')", [gate, "8".repeat(64), at("07:05")], /Invalid or revoked/)
    await expectFail("select public.report_unregistered_scan($1,$2,'2099-01-01T00:00:00Z','nm-future')", [gate, hash], /timestamp/)
    assert.equal(await count("attendance_unregistered_scans"), 1)
    assert.equal(await count("biometric_attendance_events"), 0)
  })

  await test("Scan notices: unlinked slot, inactive worker and other scanner are answered instead of stopping the scanner", async () => {
    assert.deepEqual([(await ingest("99", at("07:10"), "nl-1")).reason, (await ingest("22", at("07:11"), "in-1")).reason, (await ingest("23", at("07:12"), "od-1")).reason],
      ["not_linked", "inactive", "other_device"])
    assert.equal((await ingest("99", at("07:10"), "nl-1")).reason, "not_linked", "Retry: same answer")
    await asOwner()
    const rows = (await db.query("select reason,sensor_slot,worker_id from public.attendance_unregistered_scans where project_id=$1 and reason<>'no_match' order by occurred_at", [project])).rows
    assert.deepEqual(rows, [{ reason: "not_linked", sensor_slot: "99", worker_id: null }, { reason: "inactive", sensor_slot: "22", worker_id: retired }, { reason: "other_device", sensor_slot: "23", worker_id: elsewhere }])
    assert.equal(await count("biometric_attendance_events"), 0)
    const ok = await ingest("21", at("07:15"), "ok-1")
    assert.equal(ok.status, "recorded"); assert.equal(ok.direction, "in")
    await asOwner(); await db.query("update public.attendance_workers set active=false where id=$1", [active])
    assert.equal((await ingest("21", at("07:15"), "ok-1")).status, "recorded", "A recorded scan keeps its answer after the worker is deactivated")
    assert.equal((await ingest("21", at("09:00"), "ok-2")).reason, "inactive")
    await asOwner(); await db.query("update public.attendance_workers set active=true where id=$1", [active])
  })

  await test("Scan notices: unknown-finger reports are limited to 30 per scanner per minute; retries still answer", async () => {
    await asOwner()
    await db.query("insert into public.attendance_unregistered_scans(project_id,device_id,external_event_id,reason,occurred_at) select $1,$2,'flood-'||g,'no_match',now()-interval '1 hour' from generate_series(1,29) g", [project, second])
    await unmatched(at("08:00"), "limit-30", second)
    await service()
    await expectFail("select public.report_unregistered_scan($1,$2,$3,'limit-31')", [second, hash, at("08:01")], /rate limit/)
    assert.equal((await unmatched(at("08:00"), "limit-30", second)).reason, "no_match")
  })

  await test("Scan notices: project staff read them, clients and website users cannot read or write them; live updates on", async () => {
    await as("noticeFore")
    assert.ok((await db.query("select reason from public.attendance_unregistered_scans where project_id=$1", [project])).rows.length >= 4)
    await expectFail("insert into public.attendance_unregistered_scans(project_id,device_id,external_event_id,reason,occurred_at) values($1,'x','x','no_match',now())", [project], /permission denied/)
    await expectFail("select public.report_unregistered_scan($1,$2,now(),'web')", [gate, hash], /permission denied/)
    await expectFail("select public.log_unregistered_scan($1,'x','x','no_match',null,null,now())", [project], /permission denied/)
    await as("noticeClient")
    assert.equal((await db.query("select 1 from public.attendance_unregistered_scans")).rows.length, 0)
    await asOwner()
    const live = (await db.query("select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename in ('attendance_ignored_scans','attendance_unregistered_scans') order by 1")).rows.map((r) => r.tablename)
    assert.deepEqual(live, ["attendance_ignored_scans", "attendance_unregistered_scans"])
  })
}
