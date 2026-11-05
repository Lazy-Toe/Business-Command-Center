// Yhteiset näkymäpalat: muokattava teksti, työkalut, osion otsikko ja raahaus.
import { isSaneDue } from "./today.js";
import { html, useRef, useLayoutEffect, useState, useEffect, createContext, useContext } from "../../vendor/htm-preact.js";
import { patch, remove, addMany, shift, moveBefore, children as childrenOf } from "./store.js";

export { html };

// Näkymien väliset siirtymät, jotka main.js asettaa (esimerkiksi tehtävätaulukon avaus valmiilla suodattimella).
export const hooks = {};
export const ui = { edit: false, undo: null, tab: "kokonaisuus", view: "today" };
const uiListeners = new Set();
export function onUi(fn) { uiListeners.add(fn); return () => uiListeners.delete(fn); }
export function uiChanged() { uiListeners.forEach((fn) => fn()); }
// Näkymän vaihto jättää selainhistoriaan merkinnän vain, jos osoite muuttuu. replace = korvaa nykyisen merkinnän.
export function navigate(url, replace) {
  try {
    if (replace) history.replaceState(null, "", url);
    else if (url !== location.pathname + location.search + location.hash) history.pushState(null, "", url);
  } catch (e) { /* ei pakollinen */ }
}
export function setEdit(v) { ui.edit = v; document.body.classList.toggle("editing", v); uiChanged(); }

// Muokattava teksti. mode "edit" = vain muokkaustilassa, "always" = aina.
export function Text({ item, field, tag = "span", cls, ph, multi, mode = "edit", max = 10000, value, onSave, fallback = "", attrs }) {
  const ref = useRef(null);
  const editable = mode === "always" || ui.edit;
  const current = value !== undefined ? value : (item.data[field] == null ? "" : String(item.data[field]));
  const shown = current || (editable ? "" : fallback);
  const El = tag;
  useLayoutEffect(() => {
    const n = ref.current;
    if (n && document.activeElement !== n && n.textContent !== shown) n.textContent = shown;
  });
  function commit() {
    const n = ref.current; if (!n) return;
    let v = (multi ? n.innerText : n.textContent).replace(multi ? /[ \t]+/g : /\s+/g, " ").trim().slice(0, max);
    if (v === current) { n.textContent = shown; return; }
    if (onSave) onSave(v); else patch(item.id, { [field]: v });
    n.textContent = v || (editable ? "" : fallback);
  }
  if (!editable) return html`<${El} ref=${ref} class=${cls} ...${attrs}></${El}>`;
  return html`<${El} ref=${ref} class=${(cls ? cls + " " : "") + "editable"} contenteditable="plaintext-only" spellcheck=${false} data-ph=${ph || "Kirjoita"}
    title="Klikkaa muokataksesi" ...${attrs}
    onClick=${(e) => e.stopPropagation()}
    onPointerDown=${(e) => { const d = e.currentTarget.closest("[draggable=true]"); if (d) { d.setAttribute("draggable", "false"); d.dataset.dragoff = "1"; } }}
    onFocusOut=${(e) => { const d = e.currentTarget.closest("[data-dragoff]"); if (d) { d.setAttribute("draggable", "true"); delete d.dataset.dragoff; } }}
    onKeyDown=${(e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !multi) { e.preventDefault(); e.target.blur(); }
      if (e.key === "Escape") { e.target.textContent = shown; e.target.blur(); }
    }}
    onBlur=${commit}></${El}>`;
}

// Syötekenttä, joka ei nollaudu kirjoittaessa, vaikka näkymä päivittyy taustalla.
export function Input({ value, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const n = ref.current;
    if (n && document.activeElement !== n && n.value !== (value || "")) n.value = value || "";
  });
  return html`<input ref=${ref} type="text" ...${rest} />`;
}

// Määräpäivä: tallentuu vasta, kun päivä on järkevä tai tyhjä. Kesken jäänyt kirjoitus palautuu, kun kentästä poistutaan.
export function DueInput({ value, onSave, ...rest }) {
  return html`<${Input} type="date" min="2000-01-01" max="2099-12-31" value=${value || ""} ...${rest}
    onChange=${(e) => { const v = e.target.value; if (v === (value || "")) return; if (!v || isSaneDue(v)) onSave(v); }}
    onBlur=${(e) => { const v = e.target.value; if (v && !isSaneDue(v)) e.target.value = value || ""; }} />`;
}

export function removeWithUndo(item, label) {
  // Osa, jonka mukana poistuu muutakin, vaatii vahvistuksen.
  if (childrenOf(item.id).length && !confirm("Poistetaanko \"" + (label || "kohde") + "\" ja kaikki sen sisältö?")) return;
  const gone = remove(item.id);
  ui.undo = { label: (label || "Kohde") + " poistettu", run: () => addMany(gone) };
  uiChanged();
}

// Muokkaustilan työkalut yksittäiselle riville.
export function Tools({ item, list, label, cls, children, always }) {
  if (!ui.edit && !always) return null;
  const stop = (fn) => (e) => { e.preventDefault(); e.stopPropagation(); fn(); };
  const i = list ? list.findIndex((x) => x.id === item.id) : -1;
  return html`<span class=${"tools " + (cls || "")} onClick=${(e) => e.stopPropagation()}>
    ${children}
    ${list && ui.edit ? html`<button type="button" aria-label=${"Siirrä ylös: " + (label || "")} title="Siirrä edelle" disabled=${i <= 0} onClick=${stop(() => shift(item.id, list, -1))}>↑</button>
    <button type="button" aria-label=${"Siirrä alas: " + (label || "")} title="Siirrä jälkeen" disabled=${i >= list.length - 1} onClick=${stop(() => shift(item.id, list, 1))}>↓</button>` : null}
    <button type="button" class="del" aria-label=${"Poista: " + (label || "")} title="Poista" onClick=${stop(() => removeWithUndo(item, label))}>×</button>
  </span>`;
}

export function AddButton({ label, onAdd, cls }) {
  if (!ui.edit) return null;
  return html`<button type="button" class=${"addbtn " + (cls || "")} onClick=${(e) => { e.stopPropagation(); onAdd(); }}>+ ${label}</button>`;
}

// Raahaus muokkaustilassa. Puhelimella siirto tehdään nuolilla.
let dragId = null;
export function dragProps(item, group) {
  if (!ui.edit) return {};
  return {
    draggable: true,
    "data-drag": group,
    onDragStart: (e) => {
      dragId = { id: item.id, group }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.id); e.stopPropagation();
    },
    onDragEnd: () => { dragId = null; }
  };
}
export function dropProps(group, onDrop) {
  if (!ui.edit) return {};
  return {
    onDragOver: (e) => { if (dragId && dragId.group === group) { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add("dropover"); } },
    onDragLeave: (e) => e.currentTarget.classList.remove("dropover"),
    onDrop: (e) => {
      e.currentTarget.classList.remove("dropover");
      if (!dragId || dragId.group !== group) return;
      e.preventDefault(); e.stopPropagation();
      const id = dragId.id; dragId = null; onDrop(id);
    }
  };
}
export function sortProps(item, list, group, label) {
  return Object.assign({}, dragProps(item, group), dropProps(group, (id) => { if (id !== item.id) moveBefore(id, item.id, list); }));
}

// Osion kääre: taitto ja työkalut. Taitettu tila on katselijakohtainen.
function readCollapsed() { try { return JSON.parse(localStorage.getItem("bcc-collapsed") || "{}") || {}; } catch (e) { return {}; } }
const collapsed = readCollapsed();
export const SectionCtx = createContext(null);
export function expandSection(id) {
  if (!collapsed[id]) return;
  delete collapsed[id];
  try { localStorage.setItem("bcc-collapsed", JSON.stringify(collapsed)); } catch (e) { /* ei pakollinen */ }
}
export function useCollapse(section) {
  const [, set] = useState(0);
  const c = !!collapsed[section.id];
  const toggle = () => {
    if (collapsed[section.id]) delete collapsed[section.id]; else collapsed[section.id] = 1;
    try { localStorage.setItem("bcc-collapsed", JSON.stringify(collapsed)); } catch (e) { /* ei pakollinen */ }
    set((x) => x + 1);
  };
  // Muokkaustilassa kaikki osiot ovat auki, koska taittopainiketta ei silloin ole.
  return { c: c && !ui.edit, toggle };
}

// Otsikko: yläotsikko, h2 ja johdanto.
export function Head({ section, toggle, c, band }) {
  const s = section;
  return html`<div class="head keep">
    <${Text} item=${s} field="eyebrow" tag="p" cls="eyebrow" ph="Yläotsikko" />
    ${ui.edit
      ? html`<${Text} item=${s} field="title" tag="h2" ph="Otsikko" />`
      : html`<h2><button type="button" class="ctog" aria-expanded=${c ? "false" : "true"} title=${c ? "Näytä osio" : "Piilota osio"} onClick=${toggle}>${s.data.title}<span class="chev" aria-hidden="true"></span></button></h2>`}
    ${s.data.intro || ui.edit ? html`<${Text} item=${s} field="intro" tag="p" multi=${true} ph="Johdanto" />` : null}
  </div>`;
}

export function useTick() { const [, set] = useState(0); return () => set((x) => x + 1); }
export function useEscape(fn) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") fn(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  });
}
export function pressable(fn) {
  return { role: "button", tabindex: 0, onClick: fn, onKeyDown: (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fn(e); } } };
}
export function mq(query) {
  const m = matchMedia(query), [v, set] = useState(m.matches);
  useEffect(() => { const h = () => set(m.matches); m.addEventListener("change", h); return () => m.removeEventListener("change", h); }, []);
  return v;
}

export const FACE_OPEN = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><circle cx="8.7" cy="10" r="0.6" fill="currentColor"/><circle cx="15.3" cy="10" r="0.6" fill="currentColor"/>';
export const FACE = {
  bad: FACE_OPEN + '<path d="M8.5 16.2c1-1.1 2.2-1.6 3.5-1.6s2.5.5 3.5 1.6"/></svg>',
  mid: FACE_OPEN + '<path d="M8.5 15.2h7"/></svg>',
  good: FACE_OPEN + '<path d="M8.5 14.2c1 1.1 2.2 1.6 3.5 1.6s2.5-.5 3.5-1.6"/></svg>'
};
export const MOODNAME = { bad: "Huono", mid: "Kohtalainen", good: "Hyvä" };
export const ORDER = ["", "bad", "mid", "good"];
export const RORDER = ["", "good", "mid", "bad"];
export const nextIn = (order, cur) => order[(order.indexOf(cur || "") + 1) % order.length];
