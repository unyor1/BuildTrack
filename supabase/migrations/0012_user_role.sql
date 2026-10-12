-- BuildTrack 0012: add the base-level role `user`.
-- Postgres cannot use a new enum value in the same transaction that adds it, so this is its own migration;
-- 0013 uses it. A `user` is a signed-in person with no project access: it is what every new sign-up becomes,
-- until an admin approves a request for Engineer, Foreman or Client.
-- Requires 0001-0011. Applied through the BUILDTRACK_MIGRATIONS connector.

alter type public.app_role add value if not exists 'user';
