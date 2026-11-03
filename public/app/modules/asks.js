import { html, Text, Tools, AddButton, ui, useCollapse, Head, sortProps } from "../core/ui.js";
import { register } from "../core/registry.js";
import { children, add } from "../core/store.js";

function View({ section }) {
  const { c, toggle } = useCollapse(section);
  const list = children(section.id, "ask");
  return html`<section class="band">
    <div class="band-in">
      <div class=${"grid" + (c ? " is-collapsed" : "")}>
        <${Head} section=${section} c=${c} toggle=${toggle} />
        <ol class="asks">
          ${list.map((a, i) => html`<li key=${a.id} ...${sortProps(a, list, "ask")}><span>${String(i + 1).padStart(2, "0")}</span><div>
            ${a.data.lead || ui.edit ? html`<${Text} item=${a} field="lead" tag="b" ph="Korostus" /> ` : null}<${Text} item=${a} field="text" ph="Mitä tarvitaan" multi=${true} /><${Tools} item=${a} list=${list} label=${a.data.text} />
          </div></li>`)}
          <${AddButton} label="Edellytys" onAdd=${() => add("ask", section.id, { lead: "", text: "" })} />
        </ol>
      </div>
      ${section.data.sources || ui.edit ? html`<${Text} item=${section} field="sources" tag="p" cls="sources" multi=${true} ph="Lähteet" />` : null}
    </div>
  </section>`;
}

register({
  type: "asks", label: "Edellytykset", hint: "Numeroitu lista tummalla nauhalla", placement: "band",
  create: () => ({ data: { eyebrow: "Edellytykset", title: "Mitä tarvitaan", sources: "" }, children: [{ kind: "ask", data: { lead: "", text: "" } }] }),
  View
});
