// Tallennetut lomakkeet scorecardilla: valinta ja selaus, luonnos, kopiointi sekä ehdotuksen käsittely.
// Tyypit ja niiden oikeudet tulevat Asetuksista, ja palvelin kirjaa tekijän, päivän ja tilan.
import { html, useState } from "../vendor/htm-preact.js";
import { Input } from "./core/ui.js";
import { createForm, decideForm, patch, add, remove } from "./core/store.js";
import { typesFor, visibleForms, formLabel, dateFi, draftRows, freezeRows, scoreForm, applyOps, nextStatus, STATUS_TEXT } from "./core/forms.js";
import { periodText } from "./core/scorecard.js";
import { fmt } from "./core/calc.js";

const FIELDS = [["target", "Tavoite"], ["min", "Alaraja"], ["max", "Yläraja"], ["actual", "Toteuma"], ["weight", "Paino %"]];
const errText = (e) => (e.body && (e.body.detail || e.body.error)) || e.message;

// Kopioitavan lomakkeen arvot luonnokseksi: rivit, jotka ovat vielä roolin tavoitteita, ja muut rivit scorecardin arvoista.
function rowsFromForm(rows, effective) {
  const base = draftRows(effective), old = new Map((rows || []).map((r) => [r.def, r]));
  return base.map((b) => (old.has(b.def) ? Object.assign({}, b, { target: old.get(b.def).target, min: old.get(b.def).min, max: old.get(b.def).max, weight: old.get(b.def).weight, actual: old.get(b.def).actual }) : b));
}

function Result({ s }) {
  return html`<td class="num" title=${s.error || ""}>${s.error ? "Kaavavirhe" : fmt(s.result, 2)}</td>`;
}

export function FormPanel({ planId, role, effective, forms, types, viewer, canApply }) {
  const [sel, setSel] = useState("");
  const [draft, setDraft] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const list = visibleForms(role, forms, types, viewer), allowed = typesFor(types, viewer.admin);
  const cur = list.find((f) => f.id === sel), idx = list.findIndex((f) => f.id === sel);
  if (!list.length && !allowed.length) return null;
  const go = (i) => { if (i >= 0 && i < list.length) { setSel(list[i].id); setDraft(null); setMsg(""); } };
  const start = (from) => {
    const t = (from && allowed.find((x) => x.id === from.data.type)) || allowed[0];
    if (!t) return;
    setDraft({ type: t.id, comment: "", rows: from ? rowsFromForm(from.data.rows, effective) : draftRows(effective) });
    setSel("new"); setMsg("");
  };
  const run = async (fn) => { setBusy(true); setMsg(""); try { await fn(); } catch (e) { setMsg(errText(e)); } setBusy(false); };

  let body = null;
  if (draft) {
    const t = types.find((x) => x.id === draft.type), byDef = new Map(effective.map((x) => [x.def.id, x]));
    const fr = t && t.data.table ? freezeRows(draft.rows, effective) : null, sc = fr && !fr.error ? scoreForm(fr.rows) : null;
    const setRow = (i, k, v) => setDraft((d) => Object.assign({}, d, { rows: d.rows.map((r, n) => (n === i ? Object.assign({}, r, { [k]: v }) : r)) }));
    body = html`<div class="fdraft">
      <div class="mfrow"><label for="fd-type">Toiminto</label><select id="fd-type" value=${draft.type} onChange=${(e) => setDraft((d) => Object.assign({}, d, { type: e.target.value }))}>${allowed.map((x) => html`<option key=${x.id} value=${x.id}>${x.data.name || "Nimetön"}</option>`)}</select></div>
      <div class="mfrow"><label for="fd-comment">Kommentti</label><textarea id="fd-comment" rows="3" maxlength="4000" value=${draft.comment} onInput=${(e) => setDraft((d) => Object.assign({}, d, { comment: e.target.value }))}></textarea></div>
      ${t && t.data.table ? html`<div class="gtable-wrap"><table class="gtable sctable">
        <thead><tr><th>Tavoite</th><th>Jakso</th>${FIELDS.map(([, l]) => html`<th key=${l}>${l}</th>`)}<th>Tulos</th><th>Painotettu</th></tr></thead>
        <tbody>${draft.rows.map((r, i) => {
          const x = byDef.get(r.def), lock = (x && x.def.data.lock) || {}, s = sc && sc.rows[i] ? sc.rows[i].score : null;
          return html`<tr key=${r.def}><td class="nmtd"><b>${x ? x.def.data.name : r.def}</b></td><td class="gs">${s ? periodText(s.start, s.end) || "–" : "–"}</td>
            ${FIELDS.map(([k, l]) => (lock[k] ? html`<td class="num lockedcell" key=${k} title="Lukittu mallissa">${(x && x.score[k]) || "–"}</td>` : html`<td key=${k}><${Input} maxlength="30" placeholder="–" aria-label=${(x ? x.def.data.name : "") + ": " + l} value=${r[k] || ""} onChange=${(e) => setRow(i, k, e.target.value.trim())} /></td>`))}
            ${s ? html`<${Result} s=${s} /><td class="num">${fmt(s.weighted, 3)}</td>` : html`<td></td><td></td>`}</tr>`;
        })}</tbody>
        ${sc && sc.total.count ? html`<tfoot><tr><td colspan="7"><b>Lopputulos</b></td><td class="num"><b>${fmt(sc.total.weighted, 3)}</b></td></tr></tfoot>` : null}
      </table></div>${fr && fr.error ? html`<p class="gs bad">${fr.error}</p>` : null}` : null}
      <div class="hact mfact">
        <button type="button" class="barbtn primary" disabled=${busy || !t || (fr && !!fr.error)} onClick=${() => run(async () => { const id = await createForm(planId, { role: role.id, type: draft.type, comment: draft.comment, rows: t.data.table ? draft.rows : [] }); setDraft(null); setSel(id); })}>Tallenna</button>
        <button type="button" class="barbtn" onClick=${() => setDraft((d) => Object.assign({}, d, { comment: "", rows: draftRows(effective) }))}>Tyhjennä</button>
        <button type="button" class="barbtn" onClick=${() => { setDraft(null); setSel(list.length ? list[0].id : ""); setMsg(""); }}>Peruuta</button>
      </div></div>`;
  } else if (cur) {
    const t = types.find((x) => x.id === cur.data.type), s = scoreForm(cur.data.rows), st = cur.data.status || "";
    const decide = (to) => run(async () => { await decideForm(planId, cur.id, to); });
    const applyNow = () => run(async () => {
      applyOps(cur, role, effective).forEach((o) => (o.op === "patch" ? patch(o.id, o.data) : add("metric", role.id, o.data, { id: o.id })));
      await decideForm(planId, cur.id, "applied");
    });
    body = html`<div class="fview">
      <div class="fmeta">
        <div><span>Pvm</span><b>${dateFi(cur.data.at)}</b></div><div><span>Nimi</span><b>${cur.data.by || ""}</b></div><div><span>Toiminto</span><b>${cur.data.typeName || ""}</b></div>
        ${t && t.data.proposal ? html`<div><span>Tila</span><b>${STATUS_TEXT[st] || STATUS_TEXT.open}</b>${cur.data.decidedBy ? html`<span class="gs"> ${cur.data.decidedBy}, ${dateFi(cur.data.decidedAt)}</span>` : null}</div>` : null}
      </div>
      ${cur.data.comment ? html`<p class="fcomment">${cur.data.comment}</p>` : null}
      ${s.rows.length ? html`<div class="gtable-wrap"><table class="gtable sctable">
        <thead><tr><th>Tavoite</th><th>Jakso</th><th>Tavoite</th><th>Alaraja</th><th>Yläraja</th><th>Toteuma</th><th>Tulos</th><th>Paino %</th><th>Painotettu</th></tr></thead>
        <tbody>${s.rows.map((r) => html`<tr key=${r.def}><td class="nmtd"><b>${r.name}</b></td><td class="gs">${periodText(r.start, r.end) || "–"}</td><td class="num">${r.target || "–"}</td><td class="num">${r.min || "–"}</td><td class="num">${r.max || "–"}</td><td class="num">${r.actual || "–"}</td><${Result} s=${r.score} /><td class="num">${r.weight || "–"}</td><td class="num">${fmt(r.score.weighted, 3)}</td></tr>`)}</tbody>
        ${s.total.count ? html`<tfoot><tr><td colspan="8"><b>Lopputulos</b></td><td class="num"><b>${fmt(s.total.weighted, 3)}</b></td></tr></tfoot>` : null}
      </table></div>` : null}
      ${viewer.admin && t && t.data.proposal ? html`<div class="hact mfact">
        <button type="button" class="barbtn" disabled=${busy || !nextStatus(st || "open", "accepted") || st === "accepted"} onClick=${() => decide("accepted")}>Hyväksy</button>
        <button type="button" class="barbtn" disabled=${busy || !nextStatus(st || "open", "rejected") || st === "rejected"} onClick=${() => decide("rejected")}>Hylkää</button>
        ${canApply ? html`<button type="button" class="barbtn primary" disabled=${busy || !nextStatus(st || "open", "applied")} title="Kopioi tavoitteet, rajat ja painot scorecardille" onClick=${applyNow}>Ota käyttöön</button>` : null}
      </div>` : null}
    </div>`;
  } else body = html`<p class="gs">${list.length ? "Valitse lomake valikosta." : "Ei tallennettuja lomakkeita."}</p>`;

  return html`<section class="formpanel">
    <h3>Lomakkeet</h3>
    <div class="fbar">
      <button type="button" class="barbtn" disabled=${idx < 0 || idx >= list.length - 1} onClick=${() => go(idx + 1)} aria-label="Edellinen lomake">← Ed.</button>
      <select aria-label="Tallennetut lomakkeet" value=${draft ? "" : sel} onChange=${(e) => { setDraft(null); setSel(e.target.value); setMsg(""); }}>
        ${draft ? html`<option value="">Uusi lomake (luonnos)</option>` : html`<option value="">${list.length ? "Valitse lomake…" : "Ei lomakkeita"}</option>`}
        ${list.map((f) => html`<option key=${f.id} value=${f.id}>${formLabel(f)}</option>`)}
      </select>
      <button type="button" class="barbtn" disabled=${idx <= 0} onClick=${() => go(idx - 1)} aria-label="Seuraava lomake">Seur. →</button>
      ${allowed.length ? html`<button type="button" class="barbtn" onClick=${() => start(null)}>+ Uusi lomake</button>` : null}
      ${cur && allowed.length && !draft ? html`<button type="button" class="barbtn" onClick=${() => start(cur)}>Kopioi</button>` : null}
      ${cur && canApply && viewer.admin && !draft ? html`<button type="button" class="barbtn" onClick=${() => { if (confirm("Poistetaanko lomake \"" + formLabel(cur) + "\"?")) { remove(cur.id); setSel(""); } }}>Poista</button>` : null}
    </div>
    ${msg ? html`<p class="gs bad" role="alert">${msg}</p>` : null}
    ${body}
  </section>`;
}
