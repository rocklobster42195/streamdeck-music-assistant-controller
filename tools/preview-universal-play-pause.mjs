// Preview sheet for the universal Play/Pause key (kit grill 2026-10-09, Q8): the states it must
// show, in two badge layouts, so the user can pick before it is built. Invented covers (gradients).
//   node tools/preview-universal-play-pause.mjs → sim-out/previews/universal-play-pause.png
import sharp from 'sharp';
import { mdiPlay, mdiSofa, mdiRadio, mdiBattery20, mdiBatteryCharging60, mdiMusicNote, mdiFirefox, mdiMusicCircle } from '@mdi/js';

const S = 144;
const icon = (d, x, y, size, fill) => `<path transform="translate(${x} ${y}) scale(${size / 24})" fill="${fill}" d="${d}"/>`;
const cover = (a, b, c) =>
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.6" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>` +
    `<rect width="${S}" height="${S}" fill="url(#g)"/><circle cx="96" cy="52" r="30" fill="#fff" opacity="0.18"/><rect x="18" y="80" width="70" height="10" rx="5" fill="#000" opacity="0.15"/>`;

// Badges: a dark disc r 18 with a 22 px picture, as MA-C's provider badge and marker today
const disc = (cx, cy, inner) => `<circle cx="${cx}" cy="${cy}" r="18" fill="#101010" opacity="0.8"/>${inner(cx - 11, cy - 11)}`;
const sourceBadge = (cx, cy, src) => disc(cx, cy, (x, y) => (src === 'service' ? `<circle cx="${x + 11}" cy="${y + 11}" r="11" fill="#1db954"/>${icon(mdiMusicNote, x + 4, y + 4, 14, '#101010')}` : icon(src === 'radio' ? mdiRadio : mdiFirefox, x, y, 22, src === 'radio' ? '#e0e0e0' : '#ff9500')));
const markerBadge = (cx, cy) => disc(cx, cy, (x, y) => icon(mdiSofa, x, y, 22, '#b8b8be'));
const batteryBadge = (cx, cy, low) => disc(cx, cy, (x, y) => icon(low ? mdiBattery20 : mdiBatteryCharging60, x, y, 22, low ? '#ff5a4f' : '#7ad36b'));

const title = (text) =>
    `<rect y="${S - 40}" width="${S}" height="30" fill="#000" opacity="0.55"/>` +
    `<text x="8" y="${S - 19}" font-family="Segoe UI, Arial, sans-serif" font-size="19" font-weight="600" fill="#fff">${text}</text>`;
const progress = (p, color) => `<rect y="${S - 8}" width="${S}" height="8" fill="#000" opacity="0.55"/><rect y="${S - 8}" width="${Math.round(S * p)}" height="8" fill="${color}"/>`;
const pausedOverlay = (color) => `<rect width="${S}" height="${S}" fill="#000" opacity="0.55"/><circle cx="72" cy="72" r="30" fill="#000" opacity="0.55"/>${icon(mdiPlay, 48, 48, 48, color)}`;

/** One key. layout "A": marker top-left, source top-right, battery bottom-right; "B": source top-left, marker top-right, battery below the marker. */
function key(v, layout) {
    const p = [`<rect width="${S}" height="${S}" fill="#101010"/>`];
    if (v.cover) p.push(cover(...v.cover));
    else p.push(icon(v.playing ? mdiMusicCircle : mdiPlay, 36, 30, 72, v.playing ? v.color : '#9a9aa0'));
    if (v.cover && !v.playing) p.push(pausedOverlay(v.color));
    if (v.title) p.push(title(v.title));
    if (v.progress !== undefined) p.push(progress(v.progress, v.color));
    const [srcPos, markPos, battPos] = layout === 'A' ? [[S - 24, 24], [24, 24], [S - 24, v.title ? 82 : S - 30]] : [[24, 24], [S - 24, 24], [S - 24, 64]];
    if (v.source) p.push(sourceBadge(...srcPos, v.source));
    if (v.marker) p.push(markerBadge(...markPos));
    if (v.battery) p.push(batteryBadge(...battPos, v.battery === 'low'));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${p.join('')}</svg>`;
}

const states = [
    { label: 'spielt', cover: ['#ff6a3d', '#c2185b', '#4a148c'], color: '#ffb199', playing: true, progress: 0.4, title: 'Erfundener Song', source: 'service', marker: true },
    { label: 'Pause', cover: ['#ff6a3d', '#c2185b', '#4a148c'], color: '#ffb199', playing: false, progress: 0.4, title: 'Erfundener Song', source: 'service', marker: true },
    { label: 'Radio', cover: ['#00897b', '#26c6da', '#e0f7fa'], color: '#80deea', playing: true, title: 'Sender Eins', source: 'radio', marker: true },
    { label: 'App (SA-C)', cover: ['#3949ab', '#1e88e5', '#90caf9'], color: '#90caf9', playing: true, progress: 0.7, title: 'Video im Browser', source: 'app' },
    { label: 'Akku schwach', cover: ['#f9a825', '#ef6c00', '#3e2723'], color: '#ffd180', playing: true, progress: 0.2, title: 'Noch ein Song', source: 'service', marker: true, battery: 'low' },
    { label: 'lädt, ohne Titel', cover: ['#43a047', '#1b5e20', '#0d1f0f'], color: '#a5d6a7', playing: true, progress: 0.85, source: 'service', battery: 'charging' },
    { label: 'kein Cover', color: '#e0e0e0', playing: false, marker: true },
];

const pad = 16, labelH = 26, rowLabelW = 110;
const W = rowLabelW + states.length * (S + pad) + pad;
const H = labelH + 2 * (S + pad) + pad + 30;
const parts = [`<rect width="${W}" height="${H}" fill="#1b1b1f"/>`];
states.forEach((s, i) => parts.push(`<text x="${rowLabelW + pad + i * (S + pad) + S / 2}" y="20" text-anchor="middle" font-family="Segoe UI, Arial" font-size="15" fill="#ddd">${s.label}</text>`));
['A', 'B'].forEach((layout, r) => {
    const y = labelH + pad / 2 + r * (S + pad);
    parts.push(`<text x="12" y="${y + S / 2 - 8}" font-family="Segoe UI, Arial" font-size="15" font-weight="700" fill="#fff">Variante ${layout}</text>`);
    parts.push(`<text x="12" y="${y + S / 2 + 12}" font-family="Segoe UI, Arial" font-size="11" fill="#aaa">${layout === 'A' ? 'Markierung l., Quelle r.' : 'Quelle l., Markierung r.'}</text>`);
    parts.push(`<text x="12" y="${y + S / 2 + 28}" font-family="Segoe UI, Arial" font-size="11" fill="#aaa">${layout === 'A' ? 'Akku unten r.' : 'Akku r. unter Mark.'}</text>`);
    states.forEach((s, i) => {
        const x = rowLabelW + pad + i * (S + pad);
        parts.push(`<rect x="${x - 1}" y="${y - 1}" width="${S + 2}" height="${S + 2}" rx="14" fill="#000"/>`);
        parts.push(`<g transform="translate(${x} ${y})"><clipPath id="c${r}${i}"><rect width="${S}" height="${S}" rx="14"/></clipPath><g clip-path="url(#c${r}${i})">${key(s, layout).replace(/^<svg[^>]*>|<\/svg>$/g, '').replaceAll('id="g"', `id="g${r}${i}"`).replaceAll('url(#g)', `url(#g${r}${i})`)}</g></g>`);
    });
});
parts.push(`<text x="12" y="${H - 12}" font-family="Segoe UI, Arial" font-size="12" fill="#888">Universeller Play/Pause-Key, Vorschau (erfundene Cover). B = heutige MA-C-Anordnung; A = Skizze aus dem Grill.</text>`);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${parts.join('')}</svg>`;
await sharp(Buffer.from(svg)).png().toFile('sim-out/previews/universal-play-pause.png');
console.log('sim-out/previews/universal-play-pause.png');
