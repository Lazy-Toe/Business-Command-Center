// Moduulirekisteri. Uusi osiotyyppi = yksi tiedosto modules-kansiossa ja yksi rivi modules/index.js:ssä.
//
// register({
//   type:   tunniste, tallentuu osion data.type-kenttään
//   label:  nimi Lisää osio -valikossa
//   hint:   lyhyt kuvaus valikossa
//   single: true, jos osioita voi olla suunnitelmassa vain yksi
//   create: (sectionId) => { data, children: [{ kind, parent, data }] }  uuden osion oletussisältö
//   View:   komponentti, saa propsin section
//   placement: "top" (ennen välilehtiä) tai "band" (reunasta reunaan), oletus sivun sisällä
// })
const modules = new Map();
export function register(m) { modules.set(m.type, m); }
export const moduleOf = (type) => modules.get(type);
export const allModules = () => [...modules.values()];
