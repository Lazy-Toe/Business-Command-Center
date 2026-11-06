-- Alustan tietokantarakenne. Kaikki sisältö on yleisiä rivejä: suunnitelma (bcc_plans) ja
-- sen osat (bcc_items). Uusi moduuli ei vaadi uusia tauluja, vain uuden kind-arvon.

create table if not exists public.bcc_plans (
  id text primary key,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.bcc_items (
  plan_id text not null references public.bcc_plans (id) on delete cascade,
  id text not null,
  kind text not null,
  parent_id text,
  position double precision not null default 0,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (plan_id, id)
);
create index if not exists bcc_items_plan_parent on public.bcc_items (plan_id, parent_id, position);

-- Muutoshistoria: jokaisen muutoksen tai poiston edeltävä tila säilyy 180 päivää.
create table if not exists public.bcc_item_history (
  hist_id bigint generated always as identity primary key,
  plan_id text not null,
  id text not null,
  kind text not null,
  parent_id text,
  position double precision not null,
  data jsonb not null,
  op text not null,
  changed_at timestamptz not null default now()
);
create index if not exists bcc_item_history_item on public.bcc_item_history (plan_id, id, changed_at desc);

create or replace function public.bcc_log_item() returns trigger
language plpgsql set search_path = public as $fn$
begin
  insert into bcc_item_history (plan_id, id, kind, parent_id, position, data, op)
  values (old.plan_id, old.id, old.kind, old.parent_id, old.position, old.data, lower(tg_op));
  return null;
end $fn$;

drop trigger if exists bcc_items_log_update on public.bcc_items;
create trigger bcc_items_log_update after update on public.bcc_items
  for each row when (old.data is distinct from new.data) execute function public.bcc_log_item();
drop trigger if exists bcc_items_log_delete on public.bcc_items;
create trigger bcc_items_log_delete after delete on public.bcc_items
  for each row execute function public.bcc_log_item();

-- Muutokset ajetaan yhtenä transaktiona: joko kaikki tai ei mitään.
--   put:   luo tai korvaa rivin
--   patch: yhdistää kentät dataan, voi siirtää (parent_id, position)
--   del:   poistaa rivin ja sen kaikki alirivit
create or replace function public.bcc_apply_batch(p_plan text, p_ops jsonb) returns integer
language plpgsql set search_path = public as $fn$
declare
  o jsonb;
  n integer := 0;
begin
  if not exists (select 1 from bcc_plans where id = p_plan and archived_at is null) then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;
  for o in select * from jsonb_array_elements(p_ops) loop
    if o->>'op' = 'put' then
      insert into bcc_items (plan_id, id, kind, parent_id, position, data)
      values (p_plan, o->>'id', o->>'kind', o->>'parent_id', coalesce((o->>'position')::double precision, 0), coalesce(o->'data', '{}'::jsonb))
      on conflict (plan_id, id) do update
        set kind = excluded.kind, parent_id = excluded.parent_id, position = excluded.position, data = excluded.data, updated_at = now();
    elsif o->>'op' = 'patch' then
      update bcc_items set
        data = data || coalesce(o->'data', '{}'::jsonb),
        parent_id = case when o ? 'parent_id' then o->>'parent_id' else parent_id end,
        position = coalesce((o->>'position')::double precision, position),
        updated_at = now()
      where plan_id = p_plan and id = o->>'id';
    elsif o->>'op' = 'del' then
      with recursive tree as (
        select i.id from bcc_items i where i.plan_id = p_plan and i.id = o->>'id'
        union all
        select c.id from bcc_items c join tree t on c.parent_id = t.id where c.plan_id = p_plan
      )
      delete from bcc_items d using tree where d.plan_id = p_plan and d.id = tree.id;
    else
      raise exception 'bad_op' using errcode = '22023';
    end if;
    n := n + 1;
  end loop;
  update bcc_plans set updated_at = now() where id = p_plan;
  delete from bcc_item_history where changed_at < now() - interval '180 days';
  return n;
end $fn$;

-- Monistaa suunnitelman. Tunnisteet ovat suunnitelmakohtaisia, joten ne säilyvät sellaisina.
create or replace function public.bcc_duplicate_plan(p_source text, p_id text, p_title text) returns text
language plpgsql set search_path = public as $fn$
begin
  insert into bcc_plans (id, title) values (p_id, p_title);
  insert into bcc_items (plan_id, id, kind, parent_id, position, data)
  select p_id, id, kind, parent_id, position, data from bcc_items where plan_id = p_source;
  return p_id;
end $fn$;

-- Ei suoria oikeuksia: vain Worker pääsee tietoihin salaisella avaimella.
alter table public.bcc_plans enable row level security;
alter table public.bcc_items enable row level security;
alter table public.bcc_item_history enable row level security;
revoke all on public.bcc_plans, public.bcc_items, public.bcc_item_history from anon, authenticated;
grant all on public.bcc_plans, public.bcc_items, public.bcc_item_history to service_role;
revoke all on function public.bcc_apply_batch(text, jsonb) from public, anon, authenticated;
revoke all on function public.bcc_duplicate_plan(text, text, text) from public, anon, authenticated;
revoke all on function public.bcc_log_item() from public, anon, authenticated;
grant execute on function public.bcc_apply_batch(text, jsonb) to service_role;
grant execute on function public.bcc_duplicate_plan(text, text, text) to service_role;

-- Henkilöt ja kirjautumiset (003_kayttajat.sql)
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
grant execute on function public.bcc_clean_name(text), public.bcc_add_person(text), public.bcc_link_person(text, text), public.bcc_unlink_person(text) to service_role;

-- Henkilöiden hallinta (004_henkilohallinta.sql)
-- Nimeää henkilön uudelleen ja päivittää vastuualueiden ja tehtävien vastuut. Muutos kirjautuu historiaan.
create or replace function public.bcc_rename_person(p_old text, p_new text) returns text
language plpgsql set search_path = public as $fn$
declare o text := bcc_clean_name(p_old); n text := bcc_clean_name(p_new);
begin
  if o = '' or n = '' then raise exception 'bad_name' using errcode = '22023'; end if;
  perform 1 from bcc_people where lower(name) = lower(o) for update;
  if not found then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  if lower(n) <> lower(o) and exists (select 1 from bcc_people where lower(name) = lower(n)) then
    raise exception 'name_taken' using errcode = 'P0003';
  end if;
  update bcc_people set name = n where lower(name) = lower(o);
  update bcc_items set data = jsonb_set(data, '{owner}', to_jsonb(n)), updated_at = now()
   where kind in ('role', 'task') and lower(bcc_clean_name(data->>'owner')) = lower(o);
  return n;
end $fn$;

-- Poistaa henkilön vain, jos kenelläkään ei ole häneen viittaavaa vastuuta.
create or replace function public.bcc_delete_person(p_name text) returns void
language plpgsql set search_path = public as $fn$
declare nm text := bcc_clean_name(p_name);
begin
  if exists (select 1 from bcc_items where kind in ('role', 'task') and lower(bcc_clean_name(data->>'owner')) = lower(nm)) then
    raise exception 'person_in_use' using errcode = 'P0003';
  end if;
  delete from bcc_people where lower(name) = lower(nm);
end $fn$;

-- Ylläpitäjä liittää kirjautumisen henkilöön tai poistaa liitoksen (tyhjä sähköposti). Sähköposti kuuluu yhdelle henkilölle.
create or replace function public.bcc_set_person_email(p_name text, p_email text) returns void
language plpgsql set search_path = public as $fn$
declare nm text := bcc_clean_name(p_name); e text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  perform 1 from bcc_people where lower(name) = lower(nm) for update;
  if not found then raise exception 'person_not_found' using errcode = 'P0002'; end if;
  if e is not null and exists (select 1 from bcc_people where lower(email) = e and lower(name) <> lower(nm)) then
    raise exception 'email_taken' using errcode = 'P0003';
  end if;
  update bcc_people set email = e where lower(name) = lower(nm);
end $fn$;

revoke all on function public.bcc_rename_person(text, text), public.bcc_delete_person(text), public.bcc_set_person_email(text, text) from public, anon, authenticated;
grant execute on function public.bcc_rename_person(text, text), public.bcc_delete_person(text), public.bcc_set_person_email(text, text) to service_role;

-- Euromoduulin taulut ja sarake säilytetään (005_euromoduuli.sql). Sen RPC-funktiot poistettiin tiedostolla 006_poista_euro_rpc.sql.
alter table public.bcc_people add column if not exists pay jsonb not null default '{}'::jsonb;

create table if not exists public.bcc_settings (
  key text primary key,
  data jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.bcc_pay_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  by_email text not null,
  action text not null,
  target text,
  before jsonb,
  after jsonb
);

alter table public.bcc_settings enable row level security;
alter table public.bcc_pay_log enable row level security;
revoke all on public.bcc_settings, public.bcc_pay_log from anon, authenticated;
grant all on public.bcc_settings, public.bcc_pay_log to service_role;
