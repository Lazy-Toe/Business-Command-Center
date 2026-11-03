import { html, Text, Tools, AddButton, ui, pressable } from "../core/ui.js";
import { register } from "../core/registry.js";
import { children, add } from "../core/store.js";
import { planParts, focus, toggleFocusPhase, phaseClass, taskCounts } from "./plan.js";

function Stat({ item, list }) {
  const v = item.data.value || "";
  return html`<div class="stat-cell">
    <${Text} item=${item} field="value" tag="b" cls=${"num" + (/^\s*[−-]/.test(v) ? " neg" : "")} mode="always" max=${80} ph="Luku" />
    <${Text} item=${item} field="label" mode="always" max=${120} ph="Selite" />
    ${item.data.source || ui.edit ? html`<${Text} item=${item} field="source" tag="small" cls="src" ph="Lähde" />` : null}
    <${Tools} item=${item} list=${list} label="luku" />
  </div>`;
}

function Arc() {
  const parts = planParts();
  if (!parts || !parts.phases.length) return null;
  return html`<div class="arc">
    <div class="arc-bar">
      ${parts.phases.map((ph, i) => {
        const done = taskCounts(parts, ph.id);
        const on = focus.p === ph.id;
        const click = () => { if (ui.edit) return; toggleFocusPhase(ph.id); if (focus.p) { const m = document.getElementById("plan-anchor"); if (m) m.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); } };
        const El = ui.edit ? "div" : "button";
        return html`<${El} key=${ph.id} class=${"seg " + phaseClass(i, parts.phases.length) + (focus.p && !on ? " dim" : "")} style=${{ flex: ph.data.weight || 30 }} type=${ui.edit ? undefined : "button"} aria-pressed=${ui.edit ? undefined : (on ? "true" : "false")} onClick=${click}>
          <${Text} item=${ph} field="label" cls="d" ph="Ajanjakso" />
          <${Text} item=${ph} field="title" cls="t" ph="Vaihe" />
          <${Text} item=${ph} field="note" cls="n" ph="Kuvaus" />
          ${done.total ? html`<span class="pg"><span class="pgt">${done.done} / ${done.total} valmis</span><span class="pgb"><i style=${{ width: (100 * done.done / done.total) + "%" }}></i></span></span>` : null}
        </${El}>`;
      })}
    </div>
    <div class="arc-gates" aria-hidden=${ui.edit ? undefined : "true"}>
      ${parts.phases.map((ph) => html`<div key=${ph.id} style=${{ flex: ph.data.weight || 30 }}>
        <${Text} item=${ph} field="gateShort" cls="gt" ph="Portti" /><${Text} item=${ph} field="gateNum" cls="num" ph="Päivä" /><i class="diamond"></i>
      </div>`)}
    </div>
  </div>`;
}

function View({ section }) {
  const stats = children(section.id, "stat");
  return html`<header class="hero" data-section=${section.type}>
    <div class="hero-top">
      <div class="hero-copy">
        <${Text} item=${section} field="eyebrow" tag="p" cls="eyebrow" ph="Yläotsikko" />
        <${Text} item=${section} field="title" tag="h1" ph="Otsikko" />
        <${Text} item=${section} field="lede" tag="p" cls="lede" multi=${true} ph="Ydinviesti" />
        <${Text} item=${section} field="byline" tag="p" cls="byline" ph="Tekijä ja päivä" />
      </div>
      <div class="ledger" aria-label="Lähtötilanne">
        ${stats.map((s) => html`<${Stat} key=${s.id} item=${s} list=${stats} />`)}
        <${AddButton} label="Lisää luku" onAdd=${() => add("stat", section.id, { value: "", label: "" })} />
      </div>
    </div>
    <${Arc} />
  </header>`;
}

register({
  type: "hero", label: "Otsikko ja lähtötilanne", hint: "Pääviesti, tunnusluvut ja aikajana", single: true, placement: "top",
  create: () => ({ data: { eyebrow: "Yläotsikko", title: "Suunnitelman pääviesti", lede: "Mitä tavoittelemme ja miksi.", byline: "" }, children: [{ kind: "stat", data: { value: "–", label: "Tärkein lähtöluku" } }] }),
  View
});
