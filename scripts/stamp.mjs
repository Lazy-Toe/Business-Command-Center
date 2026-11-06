// Päivittää julkaisutunnisteen (näkyy sovelluksen yläpalkissa), jotta nähdään heti, mikä versio selaimessa on. Aja ennen pushia: npm run stamp
import { writeFileSync } from "node:fs";
const t = new Date().toISOString().slice(0, 16).replace("T", " ");
writeFileSync(new URL("../public/app/version.js", import.meta.url), 'export const BUILD = "' + t + ' UTC";\n');
console.log("Versio " + t + " UTC");
