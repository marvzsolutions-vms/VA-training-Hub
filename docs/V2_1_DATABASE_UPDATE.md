# VA Success Academy V2.1 database update

Before publishing the updated site, open **Supabase → SQL Editor → New query** and run the complete contents of:

`RUN_THIS_IN_SUPABASE_SQL_EDITOR.sql`

This single script:

1. Fixes the missing `system_settings.category` setup.
2. Creates the missing upgrade-request and approval tables.
3. Creates the six editable resource boxes.
4. Adds student payment status, amount paid, and total amount due.
5. Adds the required permissions and row-level security policies.

Run the file once. It is additive and designed to be safe if part of it was already applied.
