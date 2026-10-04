/** Eight well-separated hues; the actor id picks one (same id, same colour, in every session). The one hue function (srs-web#422). */
const HUES = [0, 45, 90, 140, 190, 230, 280, 320];
export function actorHue(id: string): number {
  return HUES[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length];
}
