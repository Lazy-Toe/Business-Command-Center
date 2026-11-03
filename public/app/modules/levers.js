import { html, Text, Tools, AddButton, ui, useCollapse, Head, sortProps } from "../core/ui.js";
import { register } from "../core/registry.js";
import { children, add } from "../core/store.js";
import { template } from "../core/calc.js";
import { goalValues } from "./goals.js";

function View({ section }) {
  const { c, toggle } = useCollapse(section);
  const levers = children(section.id, "lever"), principles = children(section.id, "principle");
  const R = goalValues(), values = R ? R.values : {};
  return html`<div class=${"modbody" + (c ? " is-collapsed" : "")}>
    <${Head} section=${section} c=${c} toggle=${toggle} />
    <div class="levers">
      ${levers.map((l, i) => html`<article key=${l.id} class="lever" ...${sortProps(l, levers, "lever")}>
        <p class="k"><i>${i + 1}</i><${Text} item=${l} field="name" ph="Vipu" /></p>
        ${ui.edit
          ? html`<div class="bigedit"><${Text} item=${l} field="big" tag="p" cls="big num" ph="Iso luku" /><${Text} item=${l} field="bigFallback" tag="p" cls="fbk" ph="Varateksti, jos luku puuttuu" /></div>`
          : html`<p class="big num">${template(l.data.big, l.data.bigFallback, values)}</p>`}
        <${Text} item=${l} field="text" tag="p" multi=${true} ph="Kuvaus" />
        <${Tools} item=${l} list=${levers} label=${l.data.name} />
      </article>`)}
      <${AddButton} label="Vipu" onAdd=${() => add("lever", section.id, { name: "", big: "", text: "" })} />
    </div>
    ${ui.edit ? html`<p class="gs">Isoon lukuun voi viitata tavoitelukuihin: {perus:1}, {tavoite:1}, {perus*0.05:2}, {nettopito:a}, {yhteensa:1}, {~} = arviomerkki. Numero kaksoispisteen jälkeen on desimaalien määrä.</p>` : null}
    ${principles.length || ui.edit ? html`<div class="principles">
      ${principles.map((p) => html`<div key=${p.id} ...${sortProps(p, principles, "principle")}><${Text} item=${p} field="title" tag="b" ph="Periaate" /><${Text} item=${p} field="text" ph="Selite" /><${Tools} item=${p} list=${principles} label=${p.data.title} /></div>`)}
      <${AddButton} label="Periaate" onAdd=${() => add("principle", section.id, { title: "", text: "" })} />
    </div>` : null}
  </div>`;
}

register({
  type: "levers", label: "Vivut ja periaatteet", hint: "Mihin keskitytään ja millä säännöillä",
  create: () => ({ data: { eyebrow: "Mihin keskityn", title: "Vivut", intro: "" }, children: [{ kind: "lever", data: { name: "Ensimmäinen vipu", big: "", text: "" } }] }),
  View
});
