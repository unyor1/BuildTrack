## What changed and why

## How I checked it
- [ ] `pnpm check` passes
- [ ] Looked at it in the browser (desktop and phone, light and dark) if it changes the screen
- [ ] `pnpm test:load` if I touched policies, queries or lists

## Database or security
- [ ] No database change
- [ ] New migration + tests + audit note + migrations-log row (not applied to the live project until reviewed)
- [ ] No secrets, keys or personal data in the diff

## Notes for the reviewer
