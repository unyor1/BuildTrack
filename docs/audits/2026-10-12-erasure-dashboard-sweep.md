# 2026-10-12: Right to erasure, dashboard decision band, route sweep

- Migration 0032 (see `sql/0032_data_requests.md`), `admin-users` v6 (`erase_user`), `MyDataModal`, `DataRequestsPanel`.
- Admin dashboard: "Needs your decision" band (Google sign-ups, ID checks, access requests, deletion requests) linking to the right User Management tab (`navigateAdmin` now accepts a query string); activity filter chips.
- Debug sweep of every route for all five roles at desktop and 375 px (temporary harness, deleted afterwards): no crashes, no console errors, no sideways scroll. Fixed: shell title was a second `h1` (now a `p`); text under 11 px raised to 11 px; blueprint editor now has an `sr-only` `h1`; Biometrics user select labelled.
- Known false positives of the sweep: hidden file inputs, one hidden button.
