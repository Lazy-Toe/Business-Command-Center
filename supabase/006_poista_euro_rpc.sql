-- Poistaa euromoduulin RPC-funktiot, koska käyttöliittymä ja rajapinta on poistettu.
-- Taulut (bcc_settings, bcc_pay_log) ja sarake bcc_people.pay jätetään paikoilleen, joten tiedot säilyvät.
-- Tämän voi ajaa Supabasessa milloin tahansa: julkaistu koodi ei enää kutsu näitä funktioita.
drop function if exists public.bcc_pay_get();
drop function if exists public.bcc_pay_set_def(text, jsonb, text);
drop function if exists public.bcc_pay_set_person(text, jsonb, text);
drop function if exists public.bcc_pay_log_list(int);
