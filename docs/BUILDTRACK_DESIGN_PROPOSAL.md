# BuildTrack design proposal: field pages and admin pages

Written 2026-10-12 after the auth hardening. Brand: magenta `#9E1F93` (primary actions, active navigation), orange `#F18B00` (attention, deadlines, "needs you" markers). All new screens use the semantic tokens (`bg-surface`, `text-fg`, `border-line`, `bg-brand`, `text-brand-text`) and must pass 4.5:1 in light and dark.

## 1. Engineer, Foreman and Client pages (on site, one hand, sun glare, bad signal)

### Principles
1. **One question per screen.** Each page answers "what do I do next?" first, detail second. Anything that is not an action or a number the person needs today goes behind a tap.
2. **Big targets, short words.** 44 px minimum touch targets, one primary button per card, verbs on buttons ("Fix it", "Request inspection", "Verify").
3. **Never invent a number.** A card shows live data or a skeleton, never a placeholder figure (already a hard rule).
4. **Status is colour + word + icon**, never colour alone (sunlight, colour blindness).
5. **Offline is a normal state**, shown quietly (the existing status chip) and every action that can be queued says "Saved, will send".

### Patterns
| Pattern | Where | Why it fits site work |
|---|---|---|
| **"Today" strip**: 3 to 4 summary cards (To do, Overdue, Waiting for you, Done) that are also filters | Dashboards (already started: Engineer "QA to action", Foreman "Quality tasks") | Glanceable in two seconds; tapping a card filters the list below, so no extra navigation |
| **Task cards, not tables, on phones**: title, place, deadline chip, one button | Foreman dashboard, NCR list, Client reports | A table needs sideways scrolling on a phone; a card keeps the action under the thumb |
| **Responsive inspection table**: table on desktop (sortable, filterable, CSV), collapses to cards under 640 px, sticky header, row = whole button | Engineer inspections / NCR register | Engineers audit on a laptop, foremen read the same data on a phone |
| **Quick-action tray** (floating "+" with 3 to 4 actions: Report progress, Add photo, Request inspection, Raise defect) | Foreman and Engineer, bottom-right above the bottom nav | The four things done all day are always one tap away |
| **Checklist runner**: one item per row, big Pass / Fail / N/A segmented control, measured value inline with the tolerance printed beside it and a live "within / out of tolerance" cue; sticky footer with the running score and "Complete" | Inspections (built) | Mirrors a paper ITP sheet, errors are caught as typed |
| **Timeline with photos** (who, what, when, thumbnail strip) | Pin details, NCR history | Proof is what a dispute needs; thumbnails first, full size on tap |
| **Progress ring + traffic-light line** for the client: "14% checked and approved, slightly behind schedule" | Client overview | Plain words first, numbers second; no jargon (verified, NCR) on client screens |
| **Empty states that teach**: one sentence + the one action that fills it | Everywhere | New sites start empty; the page should say what to do |
| **Bottom navigation (4 items) + "More"** on phones; sidebar on desktop | Foreman (built), extend to Engineer and Client | Matches thumb reach; sidebar stays for desks |
| **Sheet viewer with pin clustering and a pin list sheet** | Plans on phones | Dense plans become unreadable with 40 pins; cluster at low zoom, list on demand |

### Reducing clutter
- Cap each dashboard at **two columns of content**: "Needs you" (actions) and "Overview" (numbers). Everything else is one tap deeper.
- One accent per card: magenta for the action, orange only for deadlines and attention. Severity uses its own fixed scale (critical red, major amber, minor sky), not brand colours.
- Collapse secondary filters into a single "Filters" button with a count badge.
- Use progressive disclosure on detail dialogs: summary, evidence, history (accordion), actions pinned at the bottom.

## 2. Admin pages (control, audit, confidence)

### Layout
- **App frame**: left rail (collapsible to icons), top bar with project switcher, global search (Ctrl+K), notifications, profile. Content max width 1840 px (as now).
- **Dashboard in three bands**: (1) *Needs a decision* (waiting registrations, access requests, expiring invite codes, inactive accounts) as large cards with a count and a button; (2) *Health* (project health bars, QA pass rate, open critical defects) as compact KPI tiles with sparklines; (3) *Activity* (live audit feed, compact, filterable).

### Data-visualisation patterns
| Pattern | Use | Notes |
|---|---|---|
| **KPI tile + sparkline** (value, 30-day trend, delta vs last period) | Users, projects, inspections, defects | Single hue (magenta) for the line, orange only for the "worse than target" delta |
| **Stacked status bar per project** (verified / in review / in progress / not started / issues) | Project health | Replaces a table of five numbers; hover shows counts |
| **Burn-up vs schedule line** | Project overview | Verified % against time used; the gap is the story |
| **Heat-map of defects by trade and week** | QA overview | Shows where quality slips; click a cell to filter the register |
| **Compact audit log**: one line per event (time, actor avatar + name, verb, target chip), expandable JSON diff, filter chips for actor / action / date, CSV export | Audit log (exists; add chips and diff) | Dense but scannable; red marker for security events (blocked Google login, suspension) |
| **Split-view approval**: list on the left (waiting registrations, newest first, badge for requested role), detail on the right (identity from Google, details submitted, role selector pre-set to what they asked, "Approve", "Reject with reason", "Reconsider"), keyboard: J/K to move, A to approve, R to reject | User management | Clearing a queue of 20 registrations takes minutes instead of 20 dialogs; the current dialog is the first step toward this |
| **Permission matrix**: rows = admin accounts, columns = the nine permissions, checkbox cells, a column header "select all", changes staged with one Save and a confirmation that lists the diff | Permissions | Replaces per-admin dialogs; one glance shows who can do what; the diff prevents accidents |
| **Role / status pills with consistent colour** (active green, pending amber, suspended red, rejected gray) | Everywhere users appear | Same pills in tables, details, audit |
| **Session and device list per user** (last sign-in, revoke button) | User details | Pairs with the new session revocation |
| **Safe-action pattern**: destructive buttons are secondary-outlined, red text, always behind a confirm that states the effect in one sentence | Suspend, reject, delete | Already in place (`useConfirm`); keep it uniform |

### Brand cohesion
- Magenta for navigation state (active = left bar + soft magenta fill), primary buttons and selected rows; orange for "attention needed" counters and deadlines; neutral surfaces otherwise. This keeps the app calm and makes the two brand colours mean something.
- Typography: Manrope (existing) for UI, tabular numerals for every number column, 11 px minimum.
- Motion: 150 ms ease for hover and expand; no animation on data refresh; respect `prefers-reduced-motion`.
- Dark mode parity: every chart colour has a light and dark pair chosen for 4.5:1; validated with the existing contrast script.

### Suggested build order
1. Split-view registration queue and permission matrix (highest admin time saving, builds on the auth work).
2. KPI tiles with sparklines and the stacked status bar on project health.
3. Compact audit log with filter chips and expandable detail.
4. Quick-action tray and card layouts for phones (Engineer, Client).
5. Defect heat-map and burn-up chart.
