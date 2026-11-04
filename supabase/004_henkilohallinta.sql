-- Aja kerran Supabasen SQL Editorissa ennen koodin julkaisua. Turvallista ajaa uudelleen.
-- Henkilöiden hallinta: nimen muutos (päivittää vastuut kaikkiin suunnitelmiin), poisto ja kirjautumisen liittäminen.

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
