import { html, render, useEffect, useState } from "../vendor/htm-preact.js";
import * as store from "./core/store.js";
import { ui, onUi, setEdit, uiChanged, removeWithUndo, Tools, expandSection, navigate, useEscape } from "./core/ui.js";
import { TodayView } from "./views/today.js";
import { MineView } from "./views/mine.js";
import { SettingsView } from "./views/settings.js";
import { moduleOf, allModules } from "./core/registry.js";
import "./modules/index.js";
import { roles, RolePanel, showTab } from "./modules/scorecards.js";
import { HistoryPanel } from "./history.js";
import { Rail, SubNav } from "./rail.js";
import { sectionEntries } from "./core/nav.js";
import { buildToday, todayISO } from "./core/today.js";
import { buildMine } from "./core/mine.js";
import { PeoplePanel } from "./people-panel.js";

const { state, sections } = store;

function buildSection(type, position) {
  const m = moduleOf(type), id = store.uid(), def = m.create(id);
  const list = [{ id, kind: "section", parent_id: null, position, data: Object.assign({ type }, def.data) }];
  (def.children || []).forEach((c, i) => list.push({ id: store.uid(), kind: c.kind, parent_id: id, position: (i + 1) * 1000, data: c.data }));
  return list;
}

const TEMPLATE = ["hero", "plan"];
function newPlanItems() { return TEMPLATE.flatMap((t, i) => buildSection(t, (i + 1) * 1000)); }

function SaveState() {
  const text = { idle: "", saving: "Tallennetaan…", saved: "Tallennettu", error: state.error }[state.save];
  return html`<span class=${"savestate" + (state.save === "error" ? " bad" : "")} role="status">${text}</span>`;
}

function download(name, blob) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const fileName = (t) => (t || "suunnitelma").normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load")); document.head.appendChild(s); });
}

async function makePdf(title) {
  if (!window.html2canvas) await loadScript("vendor/html2canvas.min.js");
  if (!window.jspdf) await loadScript("vendor/jspdf.umd.min.js");
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  // Vasen palkki ja osiolista eivät kuulu PDF:ään, ja niiden viemä tila palautetaan kuvan jälkeen.
  const layout = ["has-rail", "has-subnav"].filter((c) => document.body.classList.contains(c));
  layout.forEach((c) => document.body.classList.remove(c));
  const w = document.documentElement.clientWidth, h = document.body.scrollHeight, scale = Math.min(2, 30000 / h);
  let canvas;
  try { canvas = await window.html2canvas(document.body, { logging: false, scale, backgroundColor: getComputedStyle(document.body).backgroundColor, windowWidth: w, width: w, height: h, x: 0, y: 0, scrollX: 0, scrollY: -window.scrollY, ignoreElements: (el) => el.classList && (el.classList.contains("appbar") || el.classList.contains("rail") || el.classList.contains("subnav")) }); } finally { layout.forEach((c) => document.body.classList.add(c)); }
  const pw = 210, ph = canvas.height * pw / canvas.width;
  const pdf = new window.jspdf.jsPDF({ orientation: ph > pw ? "portrait" : "landscape", unit: "mm", format: [pw, ph], compress: true });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pw, ph);
  download(fileName(title) + ".pdf", pdf.output("blob"));
}

// Tuotavan tiedoston rakenne tarkistetaan ennen kuin mitään luodaan.
function checkImport(list) {
  const parents = new Map();
  list.forEach((x) => {
    if (!x || typeof x.id !== "string" || parents.has(x.id)) throw new Error("virheellinen tai toistuva tunniste");
    parents.set(x.id, x.parent_id == null ? null : x.parent_id);
  });
  parents.forEach((_, id) => {
    const seen = new Set();
    for (let p = id; p != null; p = parents.get(p)) {
      if (seen.has(p)) throw new Error("kehäviittaus");
      seen.add(p);
    }
  });
}

// how: ei annettu = uusi historiamerkintä, "replace" = korvaa nykyisen, "pop" = vastaus selaimen Takaisin-painikkeeseen.
function setView(v, how) {
  ui.view = v;
  if (v !== "plan" && ui.edit) setEdit(false);
  state.overviewActive = v === "today" || v === "mine";
  document.body.classList.toggle("tab-role", v === "plan" && ui.tab !== "kokonaisuus");
  try { localStorage.setItem("bcc-view", v); } catch (e) { /* ei pakollinen */ }
  if (how !== "pop") navigate(v === "today" ? location.pathname + location.search + "#tanaan" : v === "mine" ? location.pathname + location.search + "#omat" : v === "settings" ? location.pathname + location.search + "#asetukset" : (ui.tab === "kokonaisuus" ? location.pathname + location.search : "#" + ui.tab), how === "replace");
  uiChanged();
}

// Tänään-näkymästä suoraan kohteeseen sen omassa suunnitelmassa.
async function openItem(planId, item) {
  await store.openPlan(planId);
  const tab = item.kind === "metric" || item.kind === "form" ? item.parent_id : item.kind === "role" ? item.id : "kokonaisuus";
  if (item.parent_id && item.kind !== "metric" && item.kind !== "role" && item.kind !== "form") expandSection(item.parent_id);
  setView("plan");
  showTab(tab);
  setTimeout(() => {
    const n = document.querySelector('[data-item="' + CSS.escape(item.id) + '"]');
    if (!n) return;
    n.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    n.classList.add("flash");
    setTimeout(() => n.classList.remove("flash"), 2200);
  }, 80);
}

function AppBar() {
  const plan = state.plans.find((p) => p.id === state.planId);
  const [open, setOpen] = useState(false);
  const [pdf, setPdf] = useState("PDF");
  const [hist, setHist] = useState(false);
  const [ppl, setPpl] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  useEscape(() => setSubOpen(false));
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem("bcc-subnav") !== "0"; } catch (e) { return true; } });
  const [activeSec, setActiveSec] = useState("");
  const showSub = !!plan && ui.view === "plan" && state.role !== "member";
  const entriesKey = showSub ? sections().map((s) => s.id).join(",") : "";
  // Seuraa, mikä osio on näkyvissä, jotta osiolista voi korostaa sen. Vastuualuenäkymässä osiot ovat piilossa, joten mitään ei korosteta.
  useEffect(() => {
    if (!showSub) return undefined;
    let raf = 0;
    const calc = () => {
      raf = 0;
      let cur = "";
      if (ui.tab === "kokonaisuus") {
        const all = [...document.querySelectorAll("[data-sid]")];
        all.forEach((w) => { const n = w.closest("section") || w.firstElementChild; if (n && n.getBoundingClientRect().top <= 150) cur = w.dataset.sid; });
        // Sivun alareunassa viimeinen osio on aktiivinen, vaikka se olisi liian lyhyt yltääkseen yläreunaan.
        if (all.length && innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = all[all.length - 1].dataset.sid;
      }
      setActiveSec((x) => (x === cur ? x : cur));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(calc); };
    addEventListener("scroll", on, { passive: true }); addEventListener("resize", on); on();
    return () => { removeEventListener("scroll", on); removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [showSub, ui.tab, entriesKey]);
  // Jäsenellä on vain Oma työpöytä -näkymä, joten hänellä ei ole kuvakepalkkia.
  document.body.classList.toggle("has-rail", state.role !== "member");
  if (state.role === "member") return html`<div class="appbar"><div class="appbar-in"><b>Oma työpöytä</b><${SaveState} /></div></div>`;
  // Punainen merkki näyttää myöhässä olevien tehtävien määrän, kun koonti on ladattu.
  const ov = state.overview ? state.overview.items : null, day = todayISO();
  const lateAll = ov ? buildToday(ov, day, {}).late.length : 0, lateMine = ov && state.people.me ? buildMine(ov, state.people.me, day).late.length : 0;
  const railItems = [
    { id: "today", label: "Tänään", icon: "today", active: ui.view === "today", badge: lateAll, onClick: () => { setView("today"); store.loadOverview(); } },
    { id: "mine", label: "Oma työpöytä", icon: "mine", active: ui.view === "mine", badge: lateMine, onClick: () => { setView("mine"); store.loadOverview(); } },
    ...(plan ? [{ id: "overview", label: "Kokonaisuus", icon: "overview", active: ui.view === "plan", onClick: () => { const was = ui.view === "plan"; showTab("kokonaisuus"); setView("plan"); scrollTo(0, 0); setSubOpen(was ? !subOpen : true); } },
      { id: "settings", label: "Asetukset", icon: "settings", active: ui.view === "settings", onClick: () => { setView("settings"); scrollTo(0, 0); } }] : []),
    ...(plan ? [{ id: "history", label: "Muutoshistoria", icon: "history", group: "bottom", onClick: () => setHist(true) }] : []),
    { id: "people", label: "Henkilöt", icon: "people", group: "bottom", onClick: () => setPpl(true) }
  ];
  const act = (fn) => async () => { setOpen(false); try { await fn(); } catch (e) { state.save = "error"; state.error = "Toiminto epäonnistui (" + e.message + ")."; uiChanged(); } };
  const newPlan = act(async () => { const t = prompt("Uuden suunnitelman nimi"); if (t && t.trim()) { await store.createPlan(t.trim(), newPlanItems()); showTab("kokonaisuus"); setView("plan"); setEdit(true); } });
  const dup = act(async () => { const t = prompt("Kopion nimi", (plan ? plan.title : "") + " (kopio)"); if (t && t.trim()) { await store.duplicatePlan(t.trim()); setView("plan"); } });
  const rename = act(async () => { const t = prompt("Suunnitelman nimi", plan.title); if (t && t.trim()) await store.renamePlan(t.trim()); });
  const del = act(async () => { if (state.plans.length > 1 && confirm("Poistetaanko suunnitelma \"" + plan.title + "\"? Tiedot säilyvät arkistoituna tietokannassa.")) { await store.deletePlan(); showTab("kokonaisuus"); if (ui.view === "today" || ui.view === "mine") store.loadOverview(); } });
  const exp = act(async () => download(fileName(plan.title) + ".json", new Blob([JSON.stringify(store.exportPlan(), null, 1)], { type: "application/json" })));
  const imp = act(async () => {
    const f = await new Promise((res) => { const i = document.createElement("input"); i.type = "file"; i.accept = "application/json"; i.onchange = () => res(i.files[0]); i.click(); });
    if (!f) return;
    const d = JSON.parse(await f.text());
    if (d.format !== "bcc-plan" || !Array.isArray(d.items)) throw new Error("väärä tiedosto");
    checkImport(d.items);
    await store.createPlan(d.title || f.name, d.items.map((x) => ({ id: x.id, kind: x.kind, parent_id: x.parent_id, position: x.position, data: x.data })));
    showTab("kokonaisuus");
    setView("plan");
  });
  const doPdf = async () => { setPdf("Luodaan…"); try { await makePdf(plan && plan.title); setPdf("PDF"); } catch (e) { setPdf("PDF epäonnistui"); setTimeout(() => setPdf("PDF"), 2500); } };
  // Kokonaisuuden osioiden otsikot: siirtyminen suoraan osioon tai vastuualueeseen. Kiinnitetty lista on leveällä näytöllä aina näkyvissä (dock),
  // ja muuten se aukeaa Kokonaisuus-kuvakkeesta (flyout).
  const dock = showSub && pinned && matchMedia("(min-width: 1100px)").matches;
  document.body.classList.toggle("has-subnav", dock);
  const togglePin = () => { const v = !pinned; setPinned(v); setSubOpen(false); try { localStorage.setItem("bcc-subnav", v ? "1" : "0"); } catch (e) { /* ei pakollinen */ } };
  const goEntry = (e) => {
    setSubOpen(false); showTab("kokonaisuus"); setView("plan"); expandSection(e.id);
    setTimeout(() => { const w = document.querySelector('[data-sid="' + CSS.escape(e.id) + '"]'), n = w && (w.closest("section") || w.firstElementChild); if (n) n.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }, 80);
  };
  // Vastuualueen scorecard on suunnitelman otsikkoalueen alla, joten sivu rullataan scorecardiin eikä alkuun.
  const goRole = (r) => {
    setSubOpen(false); setView("plan"); showTab(r.id);
    setTimeout(() => { const n = document.querySelector(".rolepanel"); if (n) n.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }, 60);
  };
  return html`<${Rail} items=${railItems} />
  ${showSub ? html`<${SubNav} title=${plan.title} entries=${sectionEntries(sections(), (t) => (moduleOf(t) || {}).label)} roles=${roles()} activeTab=${ui.tab} activeSec=${activeSec} open=${subOpen && !dock} pinned=${pinned} onEntry=${goEntry} onRole=${goRole} onClose=${() => setSubOpen(false)} onTogglePin=${togglePin} />` : null}
  <div class="appbar">
    <div class="appbar-in">
      <select class="planselect" aria-label="Suunnitelma" value=${state.planId || ""} onChange=${(e) => { const id = e.target.value; act(async () => { await store.openPlan(id); showTab("kokonaisuus"); setView("plan"); })().finally(uiChanged); }}>
        ${state.plans.map((p) => html`<option key=${p.id} value=${p.id}>${p.title}</option>`)}
      </select>
      <div class="planmenu">
        <button type="button" class="barbtn" aria-haspopup="menu" aria-expanded=${open ? "true" : "false"} onClick=${() => setOpen(!open)}>Suunnitelma</button>
        ${open ? html`<div class="menu" role="menu">
          <button type="button" role="menuitem" onClick=${newPlan}>Uusi suunnitelma</button>
          ${plan ? html`<button type="button" role="menuitem" onClick=${dup}>Monista tämä</button>
          <button type="button" role="menuitem" onClick=${rename}>Nimeä uudelleen</button>
          <button type="button" role="menuitem" onClick=${exp}>Vie tiedostoon (JSON)</button>` : null}
          <button type="button" role="menuitem" onClick=${imp}>Tuo tiedostosta</button>
          ${plan && state.plans.length > 1 ? html`<button type="button" role="menuitem" class="danger" onClick=${del}>Poista suunnitelma</button>` : null}
        </div>` : null}
      </div>
      <${SaveState} />
      <span class="barspace"></span>
      ${ui.view === "plan" ? html`<button type="button" class="barbtn" disabled=${pdf !== "PDF"} onClick=${doPdf}>${pdf}</button>
      <button type="button" class=${"barbtn primary" + (ui.edit ? " on" : "")} aria-pressed=${ui.edit ? "true" : "false"} onClick=${() => setEdit(!ui.edit)}>${ui.edit ? "Valmis" : "Muokkaa"}</button>` : null}
    </div>
    ${hist ? html`<${HistoryPanel} onClose=${() => setHist(false)} />` : null}
    ${ppl ? html`<${PeoplePanel} onClose=${() => setPpl(false)} />` : null}
  </div>`;
}

function Tabs() {
  const list = roles();
  if (!list.length) return null;
  return html`<nav class="tabs" aria-label="Näkymät" role="tablist">
    <button type="button" class="tab" role="tab" aria-selected=${ui.tab === "kokonaisuus" ? "true" : "false"} onClick=${() => showTab("kokonaisuus")}>Kokonaisuus</button>
    ${list.map((r) => html`<button key=${r.id} type="button" class="tab" role="tab" aria-selected=${ui.tab === r.id ? "true" : "false"} onClick=${() => showTab(r.id)}>${r.data.title}${r.data.owner ? html`<span class="own">${r.data.owner}</span>` : null}</button>`)}
  </nav>`;
}

function SectionShell({ section, list, children }) {
  const m = moduleOf(section.data.type);
  return html`<div class="sectool-wrap" data-section=${section.data.type} data-sid=${section.id}>
    ${ui.edit ? html`<div class="sectool"><span class="secname">${m ? m.label : section.data.type}</span>
      <${Tools} item=${section} list=${list} label=${section.data.title || (m && m.label)} cls="on">
        ${m && !m.placement ? html`<button type="button" title="Leveys" aria-label="Vaihda leveyttä" onClick=${() => store.patch(section.id, { width: section.data.width === "half" ? "" : "half" })}>${section.data.width === "half" ? "Leveys: puolet" : "Leveys: koko"}</button>` : null}
      </${Tools}></div>` : null}
    ${children}
  </div>`;
}

function SectionView({ section, list }) {
  const m = moduleOf(section.data.type);
  if (!m) return html`<${SectionShell} section=${section} list=${list}><p class="gs">Tuntematon osiotyyppi: ${section.data.type}</p></${SectionShell}>`;
  return html`<${SectionShell} section=${section} list=${list}><${m.View} section=${section} /></${SectionShell}>`;
}

// Puolikkaat osiot asettuvat pareittain vierekkäin.
function Body({ list }) {
  const inner = list.filter((s) => { const m = moduleOf(s.data.type); return !m || !m.placement; });
  const out = [];
  for (let i = 0; i < inner.length; i++) {
    const s = inner[i], n = inner[i + 1];
    if (s.data.width === "half" && n && n.data.width === "half") {
      out.push(html`<section key=${s.id}><div class="two"><div class="col"><${SectionView} section=${s} list=${list} /></div><div class="col"><${SectionView} section=${n} list=${list} /></div></div></section>`);
      i++;
    } else out.push(html`<section key=${s.id}><${SectionView} section=${s} list=${list} /></section>`);
  }
  return out;
}

function AddSection({ list }) {
  const [open, setOpen] = useState(false);
  if (!ui.edit || ui.tab !== "kokonaisuus") return null;
  const used = new Set(list.map((s) => s.data.type));
  const options = allModules().filter((m) => !m.single || !used.has(m.type));
  const addIt = (m) => {
    setOpen(false);
    const pos = list.length ? list[list.length - 1].position + 1000 : 1000;
    store.addMany(buildSection(m.type, m.placement === "top" ? (list.length ? list[0].position - 1000 : 1000) : pos));
  };
  return html`<div class="addsection">
    <button type="button" class="addbtn" aria-expanded=${open ? "true" : "false"} onClick=${() => setOpen(!open)}>+ Lisää osio</button>
    ${open ? html`<div class="modulelist">${options.map((m) => html`<button key=${m.type} type="button" onClick=${() => addIt(m)}><b>${m.label}</b><span>${m.hint}</span></button>`)}</div>` : null}
  </div>`;
}

function Undo() {
  const u = ui.undo;
  useEffect(() => {
    if (!u) return undefined;
    const t = setTimeout(() => { if (ui.undo === u) { ui.undo = null; uiChanged(); } }, 12000);
    return () => clearTimeout(t);
  }, [u]);
  if (!u) return null;
  return html`<div class="undo" role="status">${u.label}<button type="button" onClick=${() => { u.run(); ui.undo = null; uiChanged(); }}>Kumoa</button></div>`;
}

function App() {
  const [, setV] = useState(0);
  useEffect(() => {
    const a = store.subscribe(() => setV((x) => x + 1)), b = onUi(() => setV((x) => x + 1));
    return () => { a(); b(); };
  }, []);
  if (!state.loaded) return html`<div class="wrap"><p class="gs">Ladataan…</p></div>`;
  const plan = state.plans.find((p) => p.id === state.planId);
  document.title = ui.view === "today" ? "Tänään · Business Command Center" : ui.view === "mine" ? "Oma työpöytä · Business Command Center" : ui.view === "settings" ? "Asetukset · Business Command Center" : (plan ? plan.title : "Business Command Center");
  const openIn = (p, it) => openItem(p, it).catch((e) => { state.save = "error"; state.error = "Avaus epäonnistui (" + e.message + ")."; uiChanged(); });
  if (ui.view === "mine") return html`<${AppBar} /><${MineView} open=${openIn} /><${Undo} />`;
  if (ui.view === "settings") return html`<${AppBar} /><${SettingsView} /><${Undo} />`;
  if (ui.view === "today") return html`<${AppBar} /><${TodayView} open=${(p, it) => openItem(p, it).catch((e) => { state.save = "error"; state.error = "Avaus epäonnistui (" + e.message + ")."; uiChanged(); })} /><${Undo} />`;
  if (!plan) return html`<${AppBar} /><div class="wrap"><section><h2>Ei suunnitelmia</h2><p class="gs">Luo ensimmäinen valikosta Suunnitelma.</p></section></div>`;
  const list = sections();
  if (ui.tab !== "kokonaisuus" && !roles().some((r) => r.id === ui.tab)) { ui.tab = "kokonaisuus"; document.body.classList.remove("tab-role"); }
  const top = list.filter((s) => { const m = moduleOf(s.data.type); return m && m.placement === "top"; });
  const band = list.filter((s) => { const m = moduleOf(s.data.type); return m && m.placement === "band"; });
  return html`
    <${AppBar} />
    <div class="wrap">
      ${top.map((s) => html`<${SectionView} key=${s.id} section=${s} list=${list} />`)}
      <${Tabs} />
      ${ui.tab !== "kokonaisuus" ? html`<${RolePanel} id=${ui.tab} key=${ui.tab} />` : null}
      <${Body} list=${list} />
      <${AddSection} list=${list} />
    </div>
    ${band.map((s) => html`<${SectionView} key=${s.id} section=${s} list=${list} />`)}
    <${Undo} />`;
}

(async function start() {
  const rootEl = document.getElementById("app");
  try {
    await store.init();
  } catch (e) {
    console.error(e);
    rootEl.innerHTML = "";
    const n = document.createElement("div"); n.className = "fatal"; n.textContent = "Tietoja ei saatu ladattua (" + e.message + ").";
    rootEl.appendChild(n);
    return;
  }
  if (state.role === "member") {
    setView("mine", "replace");
    render(html`<${App} />`, rootEl);
    return;
  }
  let want = (location.hash || "").slice(1);
  if (!want) { try { want = localStorage.getItem("bcc-tab") || ""; } catch (e) { want = ""; } }
  if (roles().some((r) => r.id === want)) ui.tab = want;
  // Etusivu on Tänään, ellei osoite tai edellinen käyntikerta kerro muuta.
  let view = "today";
  try { view = localStorage.getItem("bcc-view") || "today"; } catch (e) { view = "today"; }
  const hash = (location.hash || "").slice(1);
  if (hash === "tanaan") view = "today"; else if (hash === "omat") view = "mine"; else if (hash === "asetukset") view = "settings"; else if (hash && roles().some((r) => r.id === hash)) view = "plan";
  setView(["plan", "mine", "settings"].includes(view) ? view : "today", "replace");
  if (ui.view === "today" || ui.view === "mine") store.loadOverview();
  render(html`<${App} />`, rootEl);
  // Selaimen Takaisin ja Eteenpäin vaihtavat näkymää osoitteen tunnisteen mukaan.
  window.addEventListener("popstate", () => {
    const id = (location.hash || "").slice(1);
    if (id === "tanaan" || id === "omat") { setView(id === "omat" ? "mine" : "today", "pop"); store.loadOverview(); return; }
    if (id === "asetukset") { setView("settings", "pop"); return; }
    showTab(roles().some((r) => r.id === id) ? id : "kokonaisuus", true);
    setView("plan", "pop");
  });
})();
