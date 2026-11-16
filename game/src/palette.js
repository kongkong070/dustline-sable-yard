// DUSTLINE — Sable Yard. The look plan, in one place: dusk desert, rusted steel,
// sun-bleached concrete and one hazard-amber accent. The same names are the CSS
// custom properties in index.html, so the page and the scene never drift apart.
export const PALETTE = {
  canvas: '#1a1512', // dusk sky / fog
  surface: '#3a332c', // sun-bleached concrete
  hairline: '#57503f', // dry stone
  ink: '#ece5d3', // bleached cloth
  muted: '#a89a7e', // dust
  accent: '#f0a830', // hazard amber
  rust: '#8a4a2a', // rusted steel
  sage: '#5c6650', // scrub green
};

export function shade(name) {
  return PALETTE[name];
}
