// Kokonaisuus-näkymän siirtymälista ilman näkymää: osioiden otsikot sivun järjestyksessä. Tyhjä otsikko korvataan moduulin nimellä.
export function sectionEntries(sections, labelOf) {
  return sections.map((s) => ({ id: s.id, type: s.data.type, label: String(s.data.title || "").trim() || (labelOf && labelOf(s.data.type)) || "Osio" }));
}
