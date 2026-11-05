// Vastuualueen työvirrat. Uusi muoto on lista (data.streams), vanha yksi tunniste (data.stream) luetaan listana.
export function roleStreams(role) {
  const d = (role && role.data) || {};
  if (Array.isArray(d.streams)) return d.streams.filter((x) => typeof x === "string" && x);
  return d.stream ? [d.stream] : [];
}
export const hasStream = (role, stream) => !!stream && roleStreams(role).includes(stream);
// Tallennusmuoto: lista, ja ensimmäinen myös vanhaan kenttään `stream`, jotta vanhat lukijat toimivat.
export const streamsPatch = (list) => { const l = [...new Set(list.filter(Boolean))]; return { streams: l, stream: l[0] || "" }; };
