# BuildTrack: backups and how to restore a project

## Making a backup
Admin > **Backup and export** (needs the Projects permission). Pick the project and choose **Data and files** or **Data only**. The browser builds one ZIP and downloads it; the action is written to the audit log (`project.export`).

The ZIP contains:
| Path | Content |
|---|---|
| `README.txt` | what is inside and a reminder to keep the file private |
| `data/project.json` | the project row |
| `data/<table>.json` | `project_members`, `blueprints`, `blueprint_revisions`, `pins`, `pin_events`, `pin_checklist_items`, `pin_photos`, `blueprint_annotations`, `daily_reports`, `project_questions` |
| `data/team.json` | names and roles of the team at that time |
| `data/manifest.json` | counts, the file list and anything that could not be included |
| `files/blueprints/...`, `files/pin-photos/...` | plan files, previews, pictures on sheets and pin photos, under the same paths they have in storage |

Not included: user accounts and passwords (they belong to Supabase Auth), notifications, other projects. A very large project may exceed what the browser can hold (about 450 MB of files); the manifest then lists what was left out. Make a data-only backup in that case, or back up in parts.

## Restoring (done by a developer with database access)
A restore is deliberately not a button: it needs the same people to exist and it writes across many tables.
1. **Check the people.** `data/team.json` and every `*_by` / `author_id` / `user_id` column refer to user ids. They must exist in `auth.users` / `public.profiles` of the target database, or be replaced by an existing user id before loading.
2. **Insert the rows, parents first**, in the SQL editor of the BuildTrack Supabase project (never another project). Paste each JSON file into a variable and load it with `jsonb_populate_recordset`:
   ```sql
   -- repeat for each table, in this order:
   -- projects, project_members, blueprints, blueprint_revisions, pins, pin_checklist_items, pin_events,
   -- pin_photos, blueprint_annotations, daily_reports, project_questions
   insert into public.pins
   select * from jsonb_populate_recordset(null::public.pins, '<paste data/pins.json here>'::jsonb);
   ```
   Run it as the database owner. Triggers that stamp authors or notify people will fire; to avoid that, run `set session_replication_role = replica;` first and `... = origin;` afterwards.
3. **Upload the files** from `files/blueprints/` and `files/pin-photos/` to the storage buckets of the same names, keeping each path exactly (the database rows point at them).
4. **Check.** Open the project as an Engineer: sheets, pins, photos and drawings should appear; compare the counts with `data/manifest.json`.
5. Write a note in `docs/audits/` (what was restored, when, from which backup).

## Good practice
- Back up a project before deleting it, before a big change, and at milestones. Keep a copy off the computer that made it.
- Supabase also keeps its own database backups (see the project's dashboard for the plan's retention). They are a second layer, not a replacement for this export.
- Treat the ZIP like the plans themselves: store it privately.
