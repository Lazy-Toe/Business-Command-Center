-- Aja Supabasen SQL Editorissa kerran (samassa projektissa kuin THE EmCe 100 päivää).
-- Luo kopiolle oman taulun ja kopioi siihen kaikki nykyiset tiedot.
-- Alkuperäinen taulu public.status ei muutu.

create table if not exists public.bcc_status (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.bcc_status (id, data, updated_at)
select id, data, updated_at from public.status
on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at;

-- Ei suoria oikeuksia: rivitason suojaus päällä ilman sääntöjä.
-- Vain Worker pääsee tauluun salaisella avaimella.
alter table public.bcc_status enable row level security;
revoke all on public.bcc_status from anon, authenticated;
