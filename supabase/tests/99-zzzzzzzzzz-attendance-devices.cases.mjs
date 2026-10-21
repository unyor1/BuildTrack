import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"

export default async function({db,ids,as,asOwner,test,expectFail}) {
  await asOwner()
  const project=(await db.query("insert into public.projects(code,name) values('BIO-DEVICE','Device receiver tests') returning id")).rows[0].id
  const other=(await db.query("insert into public.projects(code,name) values('BIO-DEVICE2','Device other project') returning id")).rows[0].id
  await db.query("insert into public.project_members(project_id,user_id) values($1,$2)",[project,ids.attendanceFore])
  const device=randomUUID(),worker=randomUUID(),hash="a".repeat(64),nextHash="b".repeat(64)
  await db.query("insert into public.attendance_workers(id,project_id,worker_code,biometric_uid,full_name) values($1,$2,'W-D','42','Device Worker')",[worker,project])
  const ingest="select public.ingest_biometric_device_event($1,$2,$3,$4,$5,$6) id"
  const scan=[device,hash,"42","in","2026-01-02T01:00:00Z","device-source-1"]
  const service=async()=>{await asOwner();await db.exec("set role service_role")}

  await test("Attendance devices: biometric managers provision devices but cannot read token digests; field staff cannot provision",async()=>{
    await as("super","aal2")
    await db.query("insert into public.attendance_devices(id,project_id,label,token_sha256) values($1,$2,'ESP32 gate',$3)",[device,project,hash])
    assert.equal((await db.query("select id,label from public.attendance_devices where id=$1",[device])).rows.length,1)
    await expectFail("select token_sha256 from public.attendance_devices",[],/permission denied/)
    for(const who of ["attendanceFore","attendanceEng","attendanceClient","noperm"]) {
      await as(who,"aal2")
      assert.equal((await db.query("select id from public.attendance_devices where id=$1",[device])).rows.length,0)
      await expectFail("insert into public.attendance_devices(project_id,label,token_sha256) values($1,'Unauthorized',$2)",[project,hash],/row-level security/)
      await expectFail(ingest,scan,/permission denied/)
    }
  })
  await test("Attendance devices: receiver derives project/device scope, rejects wrong tokens and preserves idempotence",async()=>{
    await service()
    await expectFail(ingest,[device,nextHash,...scan.slice(2)],/Invalid or revoked/)
    await expectFail(ingest,[randomUUID(),hash,...scan.slice(2)],/Invalid or revoked/)
    const event=(await db.query(ingest,scan)).rows[0].id
    assert.equal((await db.query(ingest,scan)).rows[0].id,event)
    const row=(await db.query("select * from public.biometric_attendance_events where id=$1",[event])).rows[0]
    assert.equal(row.project_id,project);assert.equal(row.device_id,device);assert.equal(row.worker_id,worker)
    assert.ok((await db.query("select last_seen_at from public.attendance_devices where id=$1",[device])).rows[0].last_seen_at)
    await asOwner()
    await db.query("insert into public.attendance_workers(project_id,worker_code,biometric_uid,full_name) values($1,'OTHER','foreign-id','Foreign Worker')",[other])
    await service();await expectFail(ingest,[device,nextHash,"foreign-id","in",scan[4],"foreign-event"],/Invalid or revoked/)
    await expectFail(ingest,[device,hash,"foreign-id","in",scan[4],"foreign-event"],/not linked/)
  })
  await test("Attendance devices: manager revocation/rotation takes effect immediately and cannot reassign a device",async()=>{
    await as("super","aal2")
    await db.query("update public.attendance_devices set active=false where id=$1",[device])
    await expectFail("update public.attendance_devices set project_id=$2 where id=$1",[device,other],/permission denied/)
    await service();await expectFail(ingest,scan,/Invalid or revoked/)
    await as("super","aal2")
    await db.query("update public.attendance_devices set token_sha256=$2,active=true where id=$1",[device,nextHash])
    await service();await expectFail(ingest,scan,/Invalid or revoked/)
    assert.ok((await db.query(ingest,[device,nextHash,...scan.slice(2)])).rows[0].id)
  })
  await test("Attendance devices: rate limit serializes new scans but allows exact retries at the limit",async()=>{
    await service()
    for(let n=0;n<119;n++) await db.query(ingest,[device,nextHash,"42","in",scan[4],`rate-${n}`])
    await expectFail(ingest,[device,nextHash,"42","in",scan[4],"rate-overflow"],/rate limit/)
    assert.ok((await db.query(ingest,[device,nextHash,...scan.slice(2)])).rows[0].id)
    await asOwner()
    const fn="public.ingest_biometric_device_event(uuid,text,text,text,timestamptz,text)"
    for(const role of ["anon","authenticated"]) assert.equal((await db.query("select has_function_privilege($1,$2,'execute') ok",[role,fn])).rows[0].ok,false)
    assert.equal((await db.query("select has_function_privilege('service_role',$1,'execute') ok",[fn])).rows[0].ok,true)
    assert.equal((await db.query("select count(*) n from pg_publication_tables where pubname='supabase_realtime' and tablename='attendance_devices'")).rows[0].n,0)
  })
}
