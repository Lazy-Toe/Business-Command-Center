// Euromoduulin asetukset (vain ylläpitäjä): henkilön kentät, laskentasäännöt, palkkiot ja muutosloki.
import { html, useEffect, useState } from "../../vendor/htm-preact.js";
import { Input, useEscape } from "../core/ui.js";
import { state, loadPay, savePayFields, savePayRules, savePayPerson, loadPayLog, loadOverview, uid } from "../core/store.js";
import { cleanFields, varsOf, payResult, scoreOfPerson, fmtMoney } from "../core/pay.js";
import { compile, FUNCTION_NAMES } from "../core/formula.js";
import { toNumber } from "../core/scorecard.js";
import { fmt } from "../core/calc.js";

const errText = (e) => (e.body && (e.body.detail || ({ rule_in_use: "Sääntö on henkilön käytössä. Vaihda henkilön sääntö ensin.", fields_in_use: "Kenttää käyttää jokin sääntö." }[e.body.error] || e.body.error))) || e.message;

// SCORE: henkilön roolien viimeisimmän pisteytyslomakkeen lopputulos kaikista suunnitelmista.
function scoreFor(name) {
  const items = state.overview ? state.overview.items : [];
  return scoreOfPerson(name, items.filter((i) => i.kind === "role"), items.filter((i) => i.kind === "form"), items.filter((i) => i.kind === "formtype"));
}
const useLoaded = () => useEffect(() => { loadPay(); if (!state.overview) loadOverview(); }, []);
const ruleOf = (id) => state.pay.rules.find((r) => r.id === id);

// Korvaa kaavan muuttujat kokeiluarvoilla, esimerkiksi 3 000,00*0,2*0,75.
function substitute(formula, vals) {
  return formula.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}|\b[A-Z][A-Z0-9_]*\b/g, (m, b) => {
    const v = vals[(b || m).toUpperCase()];
    return v == null ? m : v.toLocaleString("fi-FI", { maximumFractionDigits: 6 }).replace(/ /g, " ");
  });
}

// Laskentasäännön muokkaus: kaava, ohje muuttujista, kokeiluarvot ja tulos heti.
function RuleEditor({ rule, onClose }) {
  const fields = state.pay.fields, vars = varsOf(fields);
  const [v, setV] = useState({ name: rule.name || "", formula: rule.formula || "", active: rule.active !== false, unit: rule.unit || "EUR" });
  const [test, setTest] = useState({});
  const [msg, setMsg] = useState("");
  useEscape(onClose);
  const set = (k, x) => setV((o) => Object.assign({}, o, { [k]: x }));
  const c = compile(v.formula, { vars });
  const nums = {}; vars.forEach((k) => { nums[k] = toNumber(test[k]); });
  const res = c.ok ? c.run(nums) : null;
  const label = (k) => (k === "SCORE" ? "Viimeisin pisteytys" : (fields.find((f) => f.key === k) || {}).label || k);
  const save = async () => {
    const next = { id: rule.id || uid(), name: v.name.trim(), formula: v.formula.trim(), active: v.active, unit: v.unit.trim() || "EUR" };
    const list = state.pay.rules.some((r) => r.id === next.id) ? state.pay.rules.map((r) => (r.id === next.id ? next : r)) : state.pay.rules.concat(next);
    try { setMsg(""); await savePayRules(list); onClose(); } catch (e) { setMsg(errText(e)); }
  };
  return html`<div class="histback" onClick=${onClose}>
    <div class="hist mform payrule" role="dialog" aria-modal="true" aria-label="Laskentasääntö" onClick=${(e) => e.stopPropagation()}>
      <div class="hhead"><h2>${rule.id ? "Muuta laskentasääntöä" : "Uusi laskentasääntö"}</h2><button type="button" class="barbtn" onClick=${onClose}>Sulje</button></div>
      <div class="paygrid">
        <div>
          <div class="mfrow"><label for="pr-name">Sääntö</label><${Input} id="pr-name" maxlength="80" value=${v.name} onChange=${(e) => set("name", e.target.value)} /></div>
          <div class="mfrow"><label for="pr-formula">Kaava</label><textarea id="pr-formula" rows="3" maxlength="500" spellcheck=${false} value=${v.formula} onInput=${(e) => set("formula", e.target.value)}></textarea>
            <span class=${"gs" + (c.ok ? "" : " bad")} role="alert">${c.ok ? "Kaava kelpaa." : c.error}</span></div>
          <p class="gs">Kaavan tulee tuottaa yksi luku. Voit käyttää operaattoreita, vertailuja, ehtolauseketta ja funktioita: ${FUNCTION_NAMES.join(", ")}. Muuttujat kirjoitetaan isoilla kirjaimilla aaltosulkeissa, esimerkiksi {SCORE}.</p>
          <ul class="varlist">${vars.map((k) => html`<li key=${k}><button type="button" class="linkbtn" onClick=${() => set("formula", v.formula + "{" + k + "}")}>{${k}}</button> = ${label(k)}</li>`)}</ul>
          <div class="mfrow"><label for="pr-unit">Yksikkö</label><${Input} id="pr-unit" maxlength="12" value=${v.unit} onChange=${(e) => set("unit", e.target.value)} /></div>
          <label class="mflock"><input type="checkbox" checked=${v.active} onChange=${(e) => set("active", e.target.checked)} /> Aktiivinen</label>
        </div>
        <div class="paytest"><h3>Kokeiluarvot</h3>
          ${vars.map((k) => html`<div class="mfrow" key=${k}><label for=${"pt-" + k}>${label(k)}</label><${Input} id=${"pt-" + k} maxlength="30" inputmode="decimal" value=${test[k] || ""} onChange=${(e) => setTest((o) => Object.assign({}, o, { [k]: e.target.value.trim() }))} /></div>`)}
          <h3>Kokeilutulokset</h3>
          <p class="payresult">${c.ok && res && res.value != null ? html`${substitute(v.formula, nums)} = <b>${fmtMoney(res.value, v.unit.trim() || "EUR")}</b>` : c.ok ? html`<span class="gs">Anna arvot${res && res.missing.length ? " (puuttuu: " + res.missing.join(", ") + ")" : ""}.</span>` : html`<span class="gs">Korjaa kaava.</span>`}</p>
        </div>
      </div>
      ${msg ? html`<p class="gs bad" role="alert">${msg}</p>` : null}
      <div class="hact mfact">
        <button type="button" class="barbtn primary" disabled=${!c.ok || !v.name.trim()} onClick=${save}>Tallenna</button>
        <button type="button" class="barbtn" onClick=${onClose}>Peruuta</button>
        ${rule.id ? html`<button type="button" class="barbtn" onClick=${async () => { if (confirm("Poistetaanko sääntö \"" + rule.name + "\"?")) { try { await savePayRules(state.pay.rules.filter((r) => r.id !== rule.id)); onClose(); } catch (e) { setMsg(errText(e)); } } }}>Poista</button>` : null}
      </div>
    </div>
  </div>`;
}

// Henkilön euro-tiedot: sääntö ja kenttien arvot. Näytetään myös SCORE ja tulos.
export function PayPersonEditor({ name, onClose }) {
  useLoaded();
  const p = state.pay.people.find((x) => x.name === name), cur = (p && p.pay) || {};
  const [rule, setRule] = useState(null);
  const [values, setValues] = useState(null);
  const [msg, setMsg] = useState("");
  useEscape(onClose);
  if (!state.pay.loaded) return html`<div class="histback" onClick=${onClose}><div class="hist"><p class="gs">${state.pay.error || "Ladataan…"}</p></div></div>`;
  const r = rule === null ? cur.rule || "" : rule, vals = values || cur.values || {};
  const sc = scoreFor(name), rl = ruleOf(r), res = payResult(rl, state.pay.fields, vals, sc.score);
  const save = async () => { try { setMsg(""); await savePayPerson(name, { rule: r, values: vals }); onClose(); } catch (e) { setMsg(errText(e)); } };
  return html`<div class="histback" onClick=${onClose}>
    <div class="hist mform" role="dialog" aria-modal="true" aria-label="Euro-tiedot" onClick=${(e) => e.stopPropagation()}>
      <div class="hhead"><h2>Euro-tiedot: ${name}</h2><button type="button" class="barbtn" onClick=${onClose}>Sulje</button></div>
      <p class="gs">Tiedot näkyvät vain ylläpitäjälle, ja jokainen muutos kirjataan lokiin.</p>
      <div class="mfrow"><label for="pp-rule">Laskentasääntö</label><select id="pp-rule" value=${r} onChange=${(e) => setRule(e.target.value)}><option value="">Ei sääntöä</option>${state.pay.rules.filter((x) => x.active || x.id === r).map((x) => html`<option key=${x.id} value=${x.id}>${x.name}${x.active ? "" : " (ei aktiivinen)"}</option>`)}</select></div>
      ${state.pay.fields.map((f) => html`<div class="mfrow" key=${f.key}><label for=${"pp-" + f.key}>${f.label}${f.unit ? " (" + f.unit + ")" : ""}</label><${Input} id=${"pp-" + f.key} maxlength="30" inputmode="decimal" value=${vals[f.key] || ""} onChange=${(e) => setValues(Object.assign({}, vals, { [f.key]: e.target.value.trim() }))} /></div>`)}
      <div class="mfrow"><label>Viimeisin pisteytys</label><span>${sc.score == null ? "–" : fmt(sc.score, 3)}${sc.parts.length ? " (" + sc.parts.length + " roolia)" : ""}</span></div>
      <div class="mfrow"><label>Tulos</label><b>${res.error ? res.error : res.value != null ? fmtMoney(res.value, rl.unit) : rl ? "Puuttuu: " + res.missing.join(", ") : "–"}</b></div>
      ${msg ? html`<p class="gs bad" role="alert">${msg}</p>` : null}
      <div class="hact mfact"><button type="button" class="barbtn primary" onClick=${save}>Tallenna</button><button type="button" class="barbtn" onClick=${onClose}>Peruuta</button></div>
    </div>
  </div>`;
}

export function PaySettings() {
  useLoaded();
  const [fd, setFd] = useState(null);
  const [rule, setRule] = useState(null);
  const [who, setWho] = useState("");
  const [msg, setMsg] = useState("");
  const [log, setLog] = useState(null);
  const pay = state.pay;
  if (!pay.loaded) return html`<section class="tgroup paysec"><h2>Euromoduuli</h2><p class="gs ${pay.error ? "bad" : ""}">${pay.error || "Ladataan…"}</p></section>`;
  const fields = fd || pay.fields, chk = cleanFields(fields);
  const setF = (i, k, x) => setFd(fields.map((f, n) => (n === i ? Object.assign({}, f, { [k]: x }) : f)));
  return html`<section class="tgroup paysec">
    <h2>Euromoduuli</h2>
    <p class="gs">Euro-tiedot ovat arkaluontoisia: ne näkyvät vain ylläpitäjälle, eivätkä ne päädy jäsenen tai koostenäkymien tietoihin. Jokainen muutos kirjataan lokiin tekijän kanssa.</p>
    ${msg ? html`<p class="gs bad" role="alert">${msg}</p>` : null}
    <h3>Henkilön kentät</h3>
    <div class="gtable-wrap"><table class="gtable sctable"><thead><tr><th>Tunniste</th><th>Otsikko</th><th>Yksikkö</th><th></th></tr></thead>
      <tbody>${fields.map((f, i) => html`<tr key=${i}><td><${Input} maxlength="41" aria-label="Tunniste" placeholder="MONTHLY_SALARY" value=${f.key} onChange=${(e) => setF(i, "key", e.target.value.trim().toUpperCase())} /></td>
        <td><${Input} maxlength="60" aria-label="Otsikko" value=${f.label} onChange=${(e) => setF(i, "label", e.target.value)} /></td>
        <td><${Input} maxlength="12" aria-label="Yksikkö" value=${f.unit || ""} onChange=${(e) => setF(i, "unit", e.target.value)} /></td>
        <td><button type="button" class="stbtn" aria-label="Poista kenttä" onClick=${() => setFd(fields.filter((_, n) => n !== i))}>×</button></td></tr>`)}</tbody></table></div>
    <div class="hact mfact">
      <button type="button" class="barbtn" onClick=${() => setFd(fields.concat({ key: "", label: "", unit: "" }))}>+ Lisää kenttä</button>
      <button type="button" class="barbtn primary" disabled=${!fd || !!chk.error} title=${chk.error || ""} onClick=${async () => { try { setMsg(""); await savePayFields(chk.fields); setFd(null); } catch (e) { setMsg(errText(e)); } }}>Tallenna kentät</button>
      ${fd && chk.error ? html`<span class="gs bad">${chk.error}</span>` : null}
    </div>
    <h3>Laskentasäännöt</h3>
    ${pay.rules.length ? html`<div class="gtable-wrap"><table class="gtable sctable"><thead><tr><th>Sääntö</th><th>Kaava</th><th>Tila</th></tr></thead>
      <tbody>${pay.rules.map((r) => html`<tr key=${r.id} class="defrow" tabIndex="0" onClick=${() => setRule(r)} onKeyDown=${(e) => { if (e.key === "Enter") setRule(r); }}><td><b>${r.name}</b></td><td><code>${r.formula}</code></td><td>${r.active ? "Aktiivinen" : "Ei aktiivinen"}</td></tr>`)}</tbody></table></div>` : html`<p class="gs">Ei sääntöjä.</p>`}
    <div class="hact mfact"><button type="button" class="barbtn" onClick=${() => setRule({})}>+ Uusi laskentasääntö</button></div>
    <h3>Palkkiot</h3>
    ${pay.people.length ? html`<div class="gtable-wrap"><table class="gtable sctable"><thead><tr><th>Henkilö</th><th>Sääntö</th><th>Pisteytys</th><th>Tulos</th><th></th></tr></thead>
      <tbody>${pay.people.map((p) => {
        const rl = ruleOf(p.pay && p.pay.rule), sc = scoreFor(p.name), res = payResult(rl, pay.fields, p.pay && p.pay.values, sc.score);
        return html`<tr key=${p.name}><td class="nmtd"><b>${p.name}</b></td><td>${rl ? rl.name : "–"}</td><td class="num">${sc.score == null ? "–" : fmt(sc.score, 3)}</td><td class="num">${res.error ? "Kaavavirhe" : res.value != null ? fmtMoney(res.value, rl.unit) : "–"}</td>
          <td><button type="button" class="barbtn" onClick=${() => setWho(p.name)}>Euro-tiedot</button></td></tr>`;
      })}</tbody></table></div>` : html`<p class="gs">Ei henkilöitä.</p>`}
    <h3>Muutosloki</h3>
    ${log ? html`<div class="gtable-wrap"><table class="gtable sctable"><thead><tr><th>Aika</th><th>Tekijä</th><th>Muutos</th><th>Kohde</th><th>Uusi arvo</th></tr></thead>
      <tbody>${log.map((l) => html`<tr key=${l.id}><td class="gs">${new Date(l.at).toLocaleString("fi-FI")}</td><td>${l.by_email}</td><td>${{ pay_fields: "Kentät", pay_rules: "Säännöt", person: "Henkilön tiedot" }[l.action] || l.action}</td><td>${l.target || ""}</td><td class="gs">${JSON.stringify(l.after).slice(0, 120)}</td></tr>`)}</tbody></table></div>`
      : html`<button type="button" class="barbtn" onClick=${() => loadPayLog().then(setLog, (e) => setMsg(errText(e)))}>Näytä muutosloki</button>`}
    ${rule ? html`<${RuleEditor} key=${rule.id || "new"} rule=${rule} onClose=${() => setRule(null)} />` : null}
    ${who ? html`<${PayPersonEditor} name=${who} onClose=${() => setWho("")} />` : null}
  </section>`;
}
