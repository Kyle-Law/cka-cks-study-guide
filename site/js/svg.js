// Shared helpers for drawing the topic diagrams as inline SVG (styled by the .visual rules in style.css).
(function () {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const marker = c => c.includes('ok') ? 'vah-ok' : c.includes('bad') ? 'vah-bad' : 'vah';

  // Box with a bold title and optional muted sub-lines. kind: '' | acc | ok | bad | ghost
  function B(x, y, w, h, title, subs, kind = '') {
    const lines = [].concat(subs || []);
    const cy = y + h / 2, ty = cy - lines.length * 8 + 5;
    let out = `<g class="vb ${kind}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>`;
    if (title) out += `<text class="t" x="${x + w / 2}" y="${ty}">${esc(title)}</text>`;
    lines.forEach((l, i) => { out += `<text class="s" x="${x + w / 2}" y="${ty + 17 * (i + 1)}">${esc(l)}</text>`; });
    return { x, y, w, h, cx: x + w / 2, cy, r: x + w, b: y + h, svg: out + '</g>' };
  }
  // Arrow with optional label. kind may include ok | bad | both
  function A(x1, y1, x2, y2, label, kind = '') {
    const both = kind.includes('both') ? ` marker-start="url(#${marker(kind)})"` : '';
    let out = `<line class="va ${kind}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#${marker(kind)})"${both}/>`;
    if (label) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, horiz = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
      const lift = 7 + Math.abs((y2 - y1) / ((x2 - x1) || 1)) * String(label).length * 3.3;
      out += horiz ? `<text class="vl" x="${mx}" y="${my - lift}">${esc(label)}</text>`
                   : `<text class="vl side" x="${mx + 8}" y="${my + 4}">${esc(label)}</text>`;
    }
    return out;
  }
  const R = (a, b, label, kind) => A(a.r, a.cy, b.x, b.cy, label, kind);   // right edge → left edge
  const D = (a, b, label, kind) => A(a.cx, a.b, b.cx, b.y, label, kind);   // bottom → top
  // Polyline arrow through points [[x,y],...]; label sits on the middle segment.
  function P(pts, label, kind = '') {
    let out = `<polyline class="va ${kind}" fill="none" points="${pts.map(p => p.join(',')).join(' ')}" marker-end="url(#${marker(kind)})"/>`;
    if (label) {
      const i = Math.floor((pts.length - 1) / 2), [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      out += `<text class="vl" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 7}">${esc(label)}</text>`;
    }
    return out;
  }
  // Dashed region with a title in its top-left corner.
  const G = (x, y, w, h, title) => `<g class="vg"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/><text x="${x + 12}" y="${y + 18}">${esc(title)}</text></g>`;
  // Free text. kind: '' | h (heading) | code | mid
  const T = (x, y, text, kind = '') => `<text class="vt ${kind}" x="${x}" y="${y}">${esc(text)}</text>`;
  // Numbered horizontal timeline.
  function Steps(x, y, w, items) {
    const step = w / items.length;
    let out = `<line class="vline" x1="${x + step / 2}" y1="${y}" x2="${x + w - step / 2}" y2="${y}"/>`;
    items.forEach(([t, s], i) => {
      const cx = x + step * i + step / 2;
      out += `<circle class="vstep" cx="${cx}" cy="${y}" r="16"/><text class="vnum" x="${cx}" y="${y + 5}">${i + 1}</text>`;
      out += `<text class="t st" x="${cx}" y="${y + 40}">${esc(t)}</text>`;
      [].concat(s || []).forEach((l, j) => { out += `<text class="s" x="${cx}" y="${y + 58 + j * 16}">${esc(l)}</text>`; });
    });
    return out;
  }
  const S = (h, items) => `<svg viewBox="0 0 760 ${h}" role="img"><defs>` +
    ['vah', 'vah-ok', 'vah-bad'].map(id => `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="${id}" d="M0,0L10,5L0,10z"/></marker>`).join('') +
    `</defs>${items.map(i => typeof i === 'string' ? i : i.svg).join('')}</svg>`;

  window.SVGKIT = { B, A, R, D, P, G, T, Steps, S };
})();
