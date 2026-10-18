# Engineer verification queue layout

- Responsive work tiles replace the always-open split list/detail layout. No record is automatically selected; a tile click or explicit pin deep link opens the review dialog. Closing the dialog returns to the tiles without reopening another record.
- Review details use Checklist, QA & NCRs, Photos, and Timeline tabs, with review actions in the dialog footer. Recently completed work can also be opened read-only for inspection of its history.
- Timelines show the latest five events by default and stay within a 288px scrollable area. View all events / Show latest only preserves access to the full history without stretching the page. The same component covers work, request-history, and inspection timelines.
- The existing open-NCR and passed-inspection guards are explained before item verification; blocked items offer a Review NCRs link. Whole-work completion still requires all checklist items to be accepted. No database rules or permissions were relaxed, and no migration is required.
- Verification: TypeScript and production build passed; 90 library tests cover explicit tile selection, project isolation, timeline limits, and item acceptance blockers. SQL regression suite: 346 passed, zero failed.
- Visual limitation: browser inventory had no connected apps or browsers, so a signed-in visual walkthrough was not available.
