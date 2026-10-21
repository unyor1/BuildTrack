# Philippine QA reference standards and inspection instructions

## Scope

Requested: add the suggested cement, masonry, roofing and green-building references, identify an explicit reinforcing-steel edition, and record the Engineer-defined requirements behind each QA decision.

- Append seven edition-specific references to the live `system_settings.standards` catalog. Preserve existing entries, custom titles, ordering and the legacy `PNS 49` citation; do not silently reinterpret old inspections as a newer edition.
- The catalog is a list of available references, not a legal applicability decision or a certificate of compliance. It does not automatically assign references to every project, replace approved drawings, or invent clauses or numerical acceptance limits.
- No existing template, work approval, submitted inspection, score or result is rewritten. No new templates are auto-approved.

## Reference sources

Checked against official source listings on 2026-10-19. Confirm the project-applicable edition, amendments and full licensed text before specifying inspection limits.

| Added catalog code | Reference | Official source |
|---|---|---|
| PNS 07:2018 | Portland cement | [DTI-BPS](https://bps.dti.gov.ph/component/content/article?Itemid=111&id=83) |
| PNS ASTM C90:2019 Amd. 1:2019 | Loadbearing concrete masonry units | [DTI-BPS](https://bps.dti.gov.ph/index.php/press-releases/23-2019/183-dti-bps-adopts-international-standards-on-masonry-units) |
| PNS ASTM C129:2019 Amd. 1:2019 | Nonloadbearing concrete masonry units | [DTI-BPS](https://bps.dti.gov.ph/index.php/press-releases/23-2019/183-dti-bps-adopts-international-standards-on-masonry-units) |
| PNS ASTM C140/C140M:2019 | Sampling/testing concrete masonry units | [DTI-BPS](https://bps.dti.gov.ph/index.php/press-releases/23-2019/183-dti-bps-adopts-international-standards-on-masonry-units) |
| PNS 67:2014 | Metallic-coated steel roofing sheets | [DTI-BPS](https://bps.dti.gov.ph/component/content/article?Itemid=111&id=267) |
| PGBC 2015 | Philippine Green Building Code | [DPWH code](https://www.dpwh.gov.ph/DPWH/sites/default/files/laws_codes_orders/PgbcBooklet23March.pdf) |
| PNS 49:2020 | Steel bars for concrete reinforcement | [DTI-BPS](https://bps.dti.gov.ph/component/content/article?Itemid=111&id=84) |

## Where to use it

1. Super Admin: **System Settings > Standards and codes** manages the reference catalog.
2. Engineer: select the project, open **Checklist Configuration**, then **Copy to project** an existing library checklist or choose **New checklist**.
3. Select **Standards cited**. Each criterion now has **Standard, edition and exact clause** (existing `reference`, 200 characters), **Acceptance criteria** and **Required evidence / test** (new optional text, 1,000 characters each).
4. Keep **Photo required**, **Hold point** and numeric measurement limits configured explicitly where applicable. The evidence/test field records instructions; it does not validate a laboratory report automatically.
5. The project Engineer confirms applicability and approves the QA checklist on the work pin using the existing approval flow. Saving a reference does not approve a work item or pass an inspection.

The new instructions appear in the template preview, the Foreman/Engineer inspection detail, and Print/PDF output. Previously cited references absent from today's catalog stay visible and selected while editing an old template.

## Database change

`supabase/migrations/20261019093602_philippine_qa_standards.sql`:

- Adds nullable `acceptance_criteria` and `evidence_requirement` to `qa_template_items` and `qa_inspection_items`, capped at 1,000 characters.
- Extends the existing save/copy/request/re-inspection functions to copy those fields with the rest of the criterion. Re-inspection copies the failed inspection's snapshot, not today's edited template.
- Preserves existing role, project and MFA checks, RLS and grants. The private stage helpers remain non-callable by API roles; public wrappers and the one-pending-request-per-pin gate are unchanged.
- Appends only missing case-insensitive codes; stops instead of deleting custom entries if the 30-reference limit would be exceeded.
- Old clients/payloads without the new optional fields still work. Old inspection fields remain null; no made-up requirements are backfilled.

## Verification

`pnpm check` passed: TypeScript, 103 library tests, comparison interactions, 367 SQL tests and the production build. Tests cover reference seeding/idempotence/custom entries/capacity, save and copy, immutable request snapshots, failed stage re-inspection, field limits, backward compatibility, role restrictions, and escaped Print/PDF text.

Applied to the live project `ruimjlhsfpaezkgfphsz` as version `20261019093602`; the CLI-created local migration filename was aligned to the hosted version. Live verification found all 16 catalog entries and four new columns. Counts stayed at 11 templates, 88 template items, 3 inspections and 24 inspection items. Fingerprints of existing inspection rows and original inspection-item columns were unchanged. The private stage helper is still not executable by `authenticated`, and `anon` still cannot save templates. Security advisor categories and counts are unchanged from the pre-deployment baseline (no new findings).
