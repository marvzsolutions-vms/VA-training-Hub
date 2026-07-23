-- VA Success Academy V2.1: six resource cards and student payments
-- Additive and safe to run more than once.

create table if not exists public.resource_slots (
  id            bigserial primary key,
  slot_number   integer not null unique check (slot_number between 1 and 6),
  title         text not null default '',
  description   text not null default '',
  button_label  text not null default 'Open resource',
  google_url    text not null default '',
  is_active     boolean not null default true,
  updated_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

insert into public.resource_slots (slot_number)
select generate_series(1, 6)
on conflict (slot_number) do nothing;

alter table public.resource_slots enable row level security;
drop policy if exists resource_slots_read on public.resource_slots;
create policy resource_slots_read on public.resource_slots
  for select to authenticated using (true);
drop policy if exists resource_slots_write on public.resource_slots;
create policy resource_slots_write on public.resource_slots
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

grant select, insert, update, delete on public.resource_slots to authenticated;
grant usage, select on sequence public.resource_slots_id_seq to authenticated;

alter table public.student_profiles
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists amount_paid numeric(12,2) not null default 0,
  add column if not exists total_amount numeric(12,2) not null default 0;

do $$ begin
  alter table public.student_profiles
    add constraint student_profiles_payment_status_check
    check (payment_status in ('unpaid','half_paid','paid'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.student_profiles
    add constraint student_profiles_payment_amounts_check
    check (amount_paid >= 0 and total_amount >= 0);
exception when duplicate_object then null; end $$;

create or replace function public.touch_resource_slot_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end $$;

drop trigger if exists trg_touch_resource_slots on public.resource_slots;
create trigger trg_touch_resource_slots before update on public.resource_slots
for each row execute function public.touch_resource_slot_updated_at();
