/* Prototype only — a badge spliced onto the shipped face. Not shipped code. */
export const BADGE = {
  /* The exact mirror of boo about the tile centre (y=21): same span, same weight, same caps.
     Up approves, down disapproves — the pair reads as one control, which a level meter never did. */
  clap:  { fill: '#9ff2c8', glyph: `<path d="M72.4 24.4L79 17.6L85.6 24.4" fill="none" stroke="#080604" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>` },
  boo:   { fill: '#ff8a7a', glyph: `<path d="M72.4 17.6L79 24.4L85.6 17.6" fill="none" stroke="#080604" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>` },
  sus:   { fill: '#f5a14a', glyph: `<path d="M74.2 16.4Q74.2 11.4 79 11.4Q83.9 11.4 83.9 16.2Q83.9 19.5 79 21.6L79 24.1" fill="none" stroke="#080604" stroke-width="3.3" stroke-linecap="round"/><circle cx="79" cy="28.6" r="2"/>` },
  shock: { fill: '#f3ece3', glyph: `<path d="M79 10.6L81.3 18.7L89.4 21L81.3 23.3L79 31.4L76.7 23.3L68.6 21L76.7 18.7Z"/>` },
};
export function withBadge(svg, mood, { bg = '#0c0a08' } = {}) {
  const b = BADGE[mood];
  if (!b) return svg;
  const tile = `<rect x="62" y="4" width="34" height="34" rx="11" fill="${b.fill}" stroke="${bg}" stroke-width="3.4"/>`;
  return svg.replace('</svg>', `${tile}<g fill="#080604">${b.glyph}</g></svg>`);
}
