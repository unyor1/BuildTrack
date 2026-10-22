# Proposed local server guide, 23 October 2026

Prepared docs/BUILDTRACK_LOCAL_SERVER_GUIDE.md at the user's request. It covers Windows host -> VMware -> Ubuntu Server, hotspot/router checks, bridging, Docker/self-hosted Supabase, local HTTPS and client certificate trust, isolated schema/accounts/files, function compatibility, frontend build settings, no-internet acceptance tests, backups and limitations.

Checked current source read-only for browser API setting names, function inventory, password login and enforced Admin authenticator assurance. Reviewed official VMware, Docker, Supabase, Caddy and MDN documentation. The guide distinguishes feasible architecture from implemented/tested deployment, WAN loss from loss of site Wi-Fi, local storage from cloud synchronization, and receiver software from physical biometric tests.

No server was installed, no application configuration/code or database was changed, and no credential files were read. All commands in the guide are future operator steps for an isolated VM. Deployment still requires the application developer to verify compatibility and execute actual tests.

User explicitly authorized committing and pushing documentation changes. The planned commit includes reviewed documentation audit notes, draft sources, diagram assets/generators and the new guide using an explicit allowlist. Temporary exports/renders, extracted reference metadata, pre-edit backup and unrelated application files remain unstaged. See docs/paper/README.md for the relationship between local working drafts and the current native Google files.
