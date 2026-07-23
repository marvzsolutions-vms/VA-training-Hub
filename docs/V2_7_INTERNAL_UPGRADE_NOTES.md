# V2.7 — Private internal notes for upgrade requests

## Behaviour

- Coaches, managers, and owners can see a private note thread on every upgrade request.
- Any of those roles can add a note.
- The note records the author, role, date, time, and message.
- Students cannot select, insert, or update these records under Supabase RLS.
- Public/student-facing decision notes remain separate from internal notes.

## Example

> Owner: Coach, did the student pay the remaining balance?
>
> Coach: Yes. I checked the proof and confirmed the payment today.

## Setup

Run `RUN_THIS_IN_SUPABASE_SQL_EDITOR.sql` in a new Supabase SQL Editor query before opening the updated app.
