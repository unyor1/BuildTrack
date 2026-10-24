# BuildTrack local operation, cloud synchronization and automatic continuity

Prepared: October 22, 2026, Philippine time.

Status: recommendation and implementation plan only. Whole-system local operation, cloud synchronization and automatic cloud/local switching are not implemented by this document. No installation, database migration, cloud-data export, DNS change or application change is authorized or performed by saving it.

## 1. Recommended direction

Keep the existing cloud Supabase backend for remote access and central coordination. Add a secured on-site backend and local website so authorized site users can continue working when the internet is unavailable. Implement a separate synchronization service for business records and actual files.

For this application, the recommended local backend is self-hosted Supabase, packaged with Docker Compose. This preserves the services the current application already uses instead of requiring a replacement backend. This is a project recommendation, not a claim that every application needs Docker.

- PostgreSQL is the database. It stores application records.
- Supabase supplies PostgreSQL together with authentication, APIs, storage and other backend services.
- Docker runs those services in containers. It does not replace PostgreSQL or synchronize records.
- pgAdmin is a database administration tool. It is not the local application server or a synchronization service.
- Synchronization is application functionality that must be designed, implemented and tested separately.

Docker can support a production deployment. However, the default Supabase CLI local stack is for development, not a secured production server. Test there first, then prepare a proper self-hosted deployment with protected credentials, HTTPS, persistent storage, backups and operational maintenance. [1][2]

Keep the existing `buildtrack_local` database unchanged while designing this setup. The standard self-hosted stack supplies its own PostgreSQL instance; it does not automatically adopt the database created in pgAdmin. Reusing a standalone database would require a separate compatibility and security plan.

## 2. Current application status

The implementation inspected for this recommendation has:

- React, TypeScript and Vite for the website.
- A single Supabase client configured by the deployed environment, in `src/lib/supabase.ts`.
- Supabase authentication and Admin MFA checks, database permissions and checked database functions, private file storage and backend functions.
- A browser offline queue whose supported kinds are `pin_progress`, `daily_report` and `pin_photo`, in `src/lib/offlineModel.ts` and `offlineQueue.ts`.
- A service worker in `public/sw.js` that caches application resources but deliberately does not cache Supabase data requests.

These existing features are not a complete local database replica, full offline login, all-module offline support or two-way cloud synchronization. Cached pages alone do not make every record and image available offline.

## 3. What is needed and why

| Component | Why it is needed |
| --- | --- |
| On-site computer/server | Runs the local website, backend, database, storage and sync worker. It must remain powered on while the site uses it. |
| Local network/router | Connects site phones, computers and the ESP32 to the server, even when the internet uplink is down. |
| Local PostgreSQL | Stores the site's authorized records and durable pending changes. |
| Local backend services | Enforce login, project/role permissions, validation, QA/NCR rules and access to private files. Browsers must not connect directly to PostgreSQL with database credentials. |
| Locally served website | Allows the application to open and refresh without needing the Vercel deployment. |
| Local storage for files | Retains real blueprint, photo and attachment bytes, not just their database paths. |
| Synchronization worker and protected cloud endpoints | Exchange changes, check authorization, handle dependencies, prevent duplicates and report conflicts. |
| HTTPS and network access controls | Protect login and records and support browser features. Do not expose a test stack, database or administrative dashboard publicly. |
| Backups and monitoring | Recover from disk failure or accidental loss; detect failed sync, low disk space and stopped services. Synchronization is not a backup. |
| Docker, for the recommended deployment | Packages the backend services together. It is optional for the general concept of synchronization, but part of this recommended Supabase deployment. |

Capacity must be chosen from actual users, files and workloads. Do not assume a storage size, purchase specification or performance result without measuring them.

## 4. Implementation process

### Phase 1: Define the operating rules

Decide which projects and records each site may retain, which actions are allowed offline, and which system owns security decisions. Whole-system coverage includes projects, blueprints/pins, checklists, QA/NCRs, reports, issues, workers/attendance and permitted communication records. It does not mean bypassing online authorization requirements for every administrative operation.

Initially, keep account creation, role/permission changes, sensitive account recovery and other high-risk administration cloud-controlled. Define how long pre-authorized offline access is valid and what happens when it expires. A disconnected site cannot immediately know that someone was disabled in the cloud.

### Phase 2: Build an isolated local test environment

Run a local backend and local website with persistent data/file volumes. Use the existing versioned database migrations, matching backend functions and storage permissions. Preserve Admin MFA, role/project checks, evidence immutability and manual checklist-completion prerequisites.

Start with non-production test data. Do not reset or overwrite the cloud project or the existing local database. Validate compatibility before planning any controlled import of live records.

### Phase 3: Bootstrap data, files and identity safely

Load the authorized site records and necessary files with stable identities and a defined synchronization starting point. Private client communications and identity/worker information must remain scoped; do not copy all company data to every site.

Configure local authentication and account mapping. Cloud and local instances can have different signing keys, so a cloud session cannot simply be assumed valid locally. Storage files, backend functions and provider/email settings require separate handling from the database import. [3]

Plan secure provisioning and future account changes rather than continually copying authentication/session tables. Google sign-in and external email delivery still require internet.

### Phase 4: Make allowed local work durable

Each action must pass the local backend's authorization and business checks. Save the business operation and its pending-sync entry transactionally where appropriate. Keep files durable and track their upload state separately.

Use stable operation identifiers and dependency references. Show clear states such as Saved locally, Pending cloud sync, Synced, Failed and Needs review. A successful local save must not be labelled as a successful cloud save.

The ESP32 can submit attendance to a configured local receiver once device authentication and replay handling are implemented. Device scan identifiers must prevent duplicate attendance during retries. Do not treat device enrollment mappings or private worker photos as public data.

### Phase 5: Implement controlled two-way synchronization

The proposed worker must:

1. Authenticate to explicitly approved endpoints with server-held credentials and scoped authority.
2. Exchange changed records using durable checkpoints and bounded, complete pagination.
3. Send pending operations in a dependency-aware order and transfer actual files.
4. Recheck cloud authorization and current record versions before accepting a change.
5. Deduplicate retries using operation identifiers and acknowledgements.
6. Preserve original actor, evidence and audit history through a designed trust model, without trusting arbitrary client-supplied actor IDs.
7. Mark an operation synced only after the necessary records and files have been acknowledged.
8. Retain rejected/conflicting work for visible review rather than silently discarding it.

Do not blindly copy modified rows in both directions. That can bypass workflow rules, repeat notifications or inspections, overwrite immutable evidence, or make authorization changes unsafe. Define tombstones/deletion behavior, version conflicts and prevention of synchronization loops.

### Phase 6: Handle conflicts and reconnection

For example, a Foreman may submit work locally while the Engineer changes that item's assignment or QA state in the cloud. The cloud must validate the operation against its current rules. If it is no longer valid, show a conflict and preserve the submitted evidence for an authorized resolution.

Do not apply an unrestricted last-write-wins rule to permissions, inspection results, completion or NCR closure. Internet recovery must not send the same pending operation once through the local worker and again directly from the browser without deduplication.

### Phase 7: Test and prepare live operation

Test internet outages, local server/network failure, power/restarts, low disk space, expired login sessions, revoked permissions, duplicate attempts, simultaneous edits, interrupted file transfers and backup restoration. Confirm all participating versions remain compatible.

For live use, configure service startup/recovery, stable local addressing, time synchronization, HTTPS, firewall rules, credential rotation, backups of both records and files, and visible synchronization health. Retain a rollback plan. Do not describe this as completed until the actual deployment and representative workflows pass.

## 5. Can the online and local versions use the same routes?

Yes. A route path such as `/foreman/projects` can exist in both versions. This is different from using exactly the same full URL.

| Requirement | What it means |
| --- | --- |
| Same paths | Cloud and local website both implement paths such as `/login`, `/valencia`, `/foreman/projects` and `/engineer/projects`. Project IDs and query parameters must remain consistent. |
| Same complete address | The hostname, scheme and port also stay the same. This requires an owned domain, internal/external name resolution, matching HTTPS and compatible frontend/backend configuration. |
| Same active session | Separate identity/session engineering is needed. Matching URLs do not make local and cloud backend tokens interchangeable. |

Installing PostgreSQL or Docker alone does not implement any of this routing behavior.

## 6. Recommended continuity design: stable local access on site

For on-site users, prefer using the local gateway while both online and offline. The gateway runs the local website/backend and the sync worker exchanges data with the cloud. Losing internet changes synchronization status, not the site's request destination during a transaction.

This recommendation avoids moving a save between independent backends after a timeout. The cloud can remain the central authority for accepted shared records and security policies, while the site holds durable pending work.

An illustrative address is `https://app.your-domain.example/foreman/projects`. This is only a placeholder, not a purchased or configured domain.

With managed split DNS, the same hostname can resolve to the local gateway on the site network and to the cloud outside it. Split DNS selects the destination by network/resolver; it is not an automatic internet-outage detector. [4] Site users should already reach the local gateway before the outage. Configure device DNS behavior and test roaming, DNS caching, encrypted-DNS settings and HTTPS certificate renewal rather than assuming immediate switching.

The frontend must actually use the corresponding approved backend. Serving the same page from a local IP while its compiled configuration still points to cloud Supabase would not provide full offline operation. The local gateway also needs its own valid HTTPS setup; Vercel's cloud certificate does not automatically install on the local server. [1][5]

The current `https://valencia-buildtrack.vercel.app` address is Vercel-managed. It will not automatically become a local address when internet disappears. For a controllable same-hostname arrangement, use a custom domain you control. Until that exists, a separately named local HTTPS address can preserve the route paths, but is not the same full URL.

This approach normally avoids a cloud/local switch during a site internet outage. It does not promise zero interruption, no re-authentication, or recovery from failure of the local server itself.

## 7. Alternative: cloud-first app with automatic local fallback

It is possible to design this, but it is a separate and more complex feature. A cached/installed application or local gateway must remain available to initiate recovery, and the device must be able to reach the on-site server.

Required controls include:

- Probe the actual permitted service using timeouts; `navigator.onLine` alone is not reliable evidence that the internet or backend works. [6]
- Treat permission failures, expired sessions and validation errors differently from lost connectivity. Never use local fallback to bypass a rejected request.
- Do not resend a timed-out mutation to another backend until its outcome is reconciled or the operation has cross-system deduplication. A timeout does not prove the cloud did not save it.
- Pin multi-step operations to one backend, use a deliberate transition state, and prevent competing workers from replaying the same pending work.
- Preserve deep links and unsaved forms; handle local/cloud account mapping, MFA/session expiry and re-authentication honestly.
- Configure and test cross-origin requests, HTTPS and browser local-network access permissions. Public pages cannot assume unrestricted access to private network servers. [7]
- Reconcile checkpoints and pending work before any controlled failback to direct cloud operation. Show the active mode and last successful sync.

The browser cannot perform this recovery if the app has not been made available locally or cached appropriately. A remote cloud server cannot reach a site whose only internet connection is down. A remote user also cannot use the site's private backend during that outage unless an independent working network path exists.

## 8. Expected behavior by situation

| Situation | Intended behavior after implementation |
| --- | --- |
| On site, local network/server working, internet available | Same local site address; locally authorized work saves and synchronizes with cloud. |
| On site, internet unavailable, local network/server working | Same local address/routes; allowed work saves locally and shows Pending cloud sync. |
| Internet returns | Worker resumes safely; acknowledged changes and files synchronize; conflicts remain visible. |
| Remote user while the site's internet is down | Cloud remains accessible if the remote user's own internet works, but shows the site's last synchronized data. |
| Site router/local server fails | Whole-system local operation is unavailable; any independent cloud or browser-queue capability must be handled as a separate recovery path. |
| Google sign-in or sending external email without internet | Unavailable or deferred; do not show an email as sent or invent a successful login. |
| Permission changed in cloud while site is disconnected | Site cannot learn instantly; apply the agreed offline-access limits, then reconcile and revalidate on reconnection. |

## 9. Acceptance criteria and decisions before implementation

The system must demonstrate that it can open/refresh agreed routes locally, authorize pre-provisioned users, read the required records/files, save allowed work durably, preserve QA/evidence rules, survive restarts, synchronize without duplicate side effects, resolve conflicts visibly and recover from a tested backup.

Before implementation, confirm the server/network owner, available hardware, site count, intended retention scope, custom domain/TLS/DNS approach, identity provisioning, offline-action matrix, conflict resolution owners and recovery requirements. Do not claim the entire system is offline-capable until each module and restriction is verified.

Recommended first milestone: a secure isolated local copy with test accounts and representative workflows. Second milestone: controlled initial data/file loading and synchronization. Third milestone: production hardening and same-address continuity testing. This is not a commitment to an unverified schedule, cost or completion date.

## 10. References

Checked October 22, 2026. External documentation supports the platform/network concepts; the deployment and sync choices above are proposed engineering decisions for BuildTrack.

1. [Supabase: Self-Hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker)
2. [Supabase: Local development workflow and production warning](https://supabase.com/docs/guides/local-development/cli-workflows)
3. [Supabase: Restore a Platform Project to Self-Hosted](https://supabase.com/docs/guides/self-hosting/restore-from-platform)
4. [Microsoft: Use DNS Policy for Split-Brain DNS Deployment](https://learn.microsoft.com/en-us/windows-server/networking/dns/deploy/split-brain-dns-deployment)
5. [Vercel: Setting up a custom domain](https://vercel.com/docs/domains/set-up-custom-domain)
6. [MDN: Navigator.onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)
7. [Chrome: Local Network Access permission](https://developer.chrome.com/blog/local-network-access)

Repository evidence: `src/lib/supabase.ts`, `src/lib/auth.tsx`, `src/lib/offlineModel.ts`, `src/lib/offlineQueue.ts`, `public/sw.js`, versioned migrations and backend functions. These were inspected read-only. No credentials or private records belong in this recommendation.
