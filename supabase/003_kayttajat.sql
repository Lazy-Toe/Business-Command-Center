-- Aja kerran Supabasen SQL Editorissa ennen koodin julkaisua. Turvallista ajaa uudelleen.
-- Henkilöt ja heidän kirjautumisensa: henkilö on nimi, johon vastuut viittaavat, ja nimeen voi liittää
-- yhden kirjautumisen (Cloudflare Accessin sähköposti). Kirjautuminen ei rajaa pääsyä, vain kohdistaa Omat-näkymän.

create table if not exists public.bcc_people (
  id bigint generated always as identity primary key,
  name text not null check (length(name) between 1 and 60),
  email text,
  created_at timestamptz not null default now()
);
create unique index if not exists bcc_people_name on public.bcc_people (lower(name));
create unique index if not exists bcc_people_email on public.bcc_people (lower(email)) where email is not null;

create or replace function public.bcc_clean_name(p text) returns text
language sql immutable set search_path = public as $fn$
  select left(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')), 60)
$fn$;

-- Lisää henkilön tai palauttaa jo olemassa olevan, kirjainkoolla ei ole väliä.
create or replace function public.bcc_add_person(p_name text) returns text
language plpgsql set search_path = public as $fn$
declare n text := bcc_clean_name(p_name); r text;
begin
  if n = '' then raise exception 'bad_name' using errcode = '22023'; end if;
  insert into bcc_people (name) values (n) on conflict do nothing;
  select name into r from bcc_people where lower(name) = lower(n);
  return r;
end $fn$;

-- Liittää kirjautumisen henkilöön. Kirjautumisella on yksi henkilö, ja toisen kirjautumisen henkilöä ei voi ottaa.
create or replace function public.bcc_link_person(p_email text, p_name text) returns text
language plpgsql set search_path = public as $fn$
declare n text := bcc_clean_name(p_name); e text := lower(btrim(coalesce(p_email, ''))); holder text;
begin
  if n = '' or e = '' then raise exception 'bad_name' using errcode = '22023'; end if;
  perform bcc_add_person(n);
  select lower(email) into holder from bcc_people where lower(name) = lower(n) for update;
  if holder is not null and holder <> e then raise exception 'person_taken' using errcode = 'P0003'; end if;
  update bcc_people set email = null where lower(email) = e and lower(name) <> lower(n);
  update bcc_people set email = e where lower(name) = lower(n);
  return (select name from bcc_people where lower(name) = lower(n));
end $fn$;

create or replace function public.bcc_unlink_person(p_email text) returns void
language sql set search_path = public as $fn$
  update bcc_people set email = null where lower(email) = lower(btrim(coalesce(p_email, '')))
$fn$;

alter table public.bcc_people enable row level security;
revoke all on public.bcc_people from anon, authenticated;
grant all on public.bcc_people to service_role;
revoke all on function public.bcc_clean_name(text), public.bcc_add_person(text), public.bcc_link_person(text, text), public.bcc_unlink_person(text) from public, anon, authenticated;
grant execute on function public.bcc_add_person(text), public.bcc_link_person(text, text), public.bcc_unlink_person(text) to service_role;

-- Nykyiset vastuuhenkilöt tulevat valittaviksi: vastuualueiden vastuuhenkilöt sekä aiemmin tallennetut nimet.
-- Tehtävien vapaasti kirjoitetut nimet jätetään pois, jottei kirjoitusvirheistä tule valittavia henkilöitä.
insert into public.bcc_people (name)
select distinct on (lower(n)) n from (
  select bcc_clean_name(data->>'owner') n from public.bcc_items where kind = 'role'
  union all
  select bcc_clean_name(p) from public.bcc_items, jsonb_array_elements_text(case when jsonb_typeof(data->'people') = 'array' then data->'people' else '[]'::jsonb end) p where kind = 'section'
) s where n <> ''
order by lower(n), n
on conflict do nothing;
