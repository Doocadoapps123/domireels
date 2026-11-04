// On-screen text the way a creator types it in the Instagram/TikTok editor, burned into a finished 1080x1920 Reel.
// The owner said our Reels "look like commercials, not reels": app-native text is part of the fix, so each style copies
// what the apps draw (their font, thin outline, rounded box) and the text just appears and disappears. No title moves.
// Pango (sharp's text input) sets the type, so accents, ñ, ¿ and color emoji come out like on the phone.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const W = 1080, H = 1920;
// The apps' safe zone: the post text and buttons own the bottom 22%, the like/comment column the right 14%, the account bar
// the top 9%. Blocks sit a little left of centre so even a full-width line clears the buttons.
const SAFE = { top: 0.09 * H + 12, bottom: 0.78 * H - 12, right: 0.86 * W - 8 };
const CX = 520, MAXW = 2 * (SAFE.right - CX);
const ANCHOR = { top: 0.19 * H, center: 0.45 * H, lower: 0.65 * H };

// size in px; pitch is line spacing in em; outline in px; shadow is its opacity and spread grows it first (the thin
// typewriter strokes vanished on a white counter); measure caps the line width (the small typewriter text ran edge to
// edge like a subtitle). The font lists fall back to what a Linux box has.
const SANS = "Avenir Next,Helvetica Neue,Inter,Arial";
const STYLES = {
  classic: { font: `${SANS} Bold`, size: 68, color: "#ffffff", pitch: 1.16, outline: 3, shadow: 0.35, pos: "top" },
  box: { font: `${SANS} Demi-Bold`, size: 60, color: "#ffffff", fill: "#000000", pitch: 1.32, pos: "center" },
  "box-light": { font: `${SANS} Demi-Bold`, size: 60, color: "#000000", fill: "#ffffff", pitch: 1.32, pos: "center" },
  typewriter: { font: "American Typewriter,Courier New Semi-Bold", size: 52, color: "#ffffff", pitch: 1.22, shadow: 0.8, spread: 1.5, measure: 660, pos: "lower" },
  meme: { font: `${SANS} Heavy`, size: 72, color: "#ffffff", pitch: 1.12, outline: 6, pos: "top" },
};

// For the LLM that picks a style per line.
export const TEXT_STYLES = {
  classic: "TikTok's default text: white bold sans with a thin dark outline. The everyday choice for a hook or a quick comment on any shot.",
  box: "White text on a black rounded box behind each line (the apps' background text). Loudest and most legible; a punchy line over a busy shot.",
  "box-light": "Black text on a white rounded box behind each line. Same shape as box but lighter and chattier; reads best on darker shots.",
  typewriter: "Instagram's Typewriter: smaller white serif with a soft shadow. A quiet aside or a place/time note ('Lawrence, MA'); best on calmer, darker shots.",
  meme: "A 'POV:' meme line: heavy white text, thick black outline, upper third. Only for POV or relatable jokes, never for prices or offers.",
};

const probe = (f, e) => execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", e, "-of", "csv=p=0", f]).toString().trim();
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ghost = (s) => `<span alpha="1">${s}</span>`;

// One Pango layout; vips crops it to the ink. A ghost "H" line above and below fixes the crop's top and bottom, so every
// line image shares one frame and can be stacked by its baseline.
const pango = (st, size, markup) =>
  sharp({ text: { text: markup, font: `${st.font} ${size}`, dpi: 72, rgba: true, align: "centre" } }).raw().toBuffer({ resolveWithObject: true });
// Emoji sequences (keycaps, flags, ZWJ, skin tones). Pango draws them in color; the apps never outline them.
const EMOJI = /[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}[\uFE0F\u{1F3FB}-\u{1F3FF}]*(?:\u200D\p{Extended_Pictographic}[\uFE0F\u{1F3FB}-\u{1F3FF}]*)*/gu;
const ink = (st, s, emoji = (e) => e) => `<span foreground="${st.color}">${esc(s).replace(EMOJI, emoji)}</span>`;

async function line(st, size, s) {
  const frame = (mid) => pango(st, size, `${ghost("H")}\n${mid}\n${ghost("H")}`);
  const { data, info } = await frame(ink(st, s));
  // Same layout with the text ghosted and a visible H after it: that H gives the baseline even when an emoji
  // made the line taller than the font's own (it does with American Typewriter).
  const m = await frame(`${ghost(esc(s))}<span foreground="#fff">H</span>`);
  let cap = m.info.height, base = 0;
  for (let y = 0; y < m.info.height; y++) for (let x = 0; x < m.info.width; x++)
    if (m.data[(y * m.info.width + x) * 4 + 3] > 128) { cap = Math.min(cap, y); base = Math.max(base, y + 1); }
  // What gets the outline: the same frame with the emoji ghosted out.
  const bare = st.outline && s.search(EMOJI) >= 0 ? (await frame(ink(st, s, ghost))).data : data;
  return { data, bare, w: info.width, h: info.height, cap, base };
}

// Balanced wrapping, like a creator who presses return so the lines come out even: the fewest lines that fit (up to 4),
// then the split with the narrowest widest line, preferring breaks at punctuation or before ¿/¡ and not leaving a
// tiny word ("la", "de", "0") hanging at a line end. `force` (text too long even shrunk) just fills lines greedily.
async function wrap(st, size, para, maxW, cache, force) {
  const words = para.split(" "), n = words.length;
  const width = async (i, j) => {
    const k = `${size}|${para}|${i}|${j}`;
    if (!cache.has(k)) cache.set(k, (await pango(st, size, ink(st, words.slice(i, j).join(" ")))).info.width);
    return cache.get(k);
  };
  const text = (ends) => ends.map((j, k) => words.slice(k ? ends[k - 1] : 0, j).join(" "));
  if (force) {
    const ends = [];
    for (let i = 0, j = 1; j <= n; j++) if (j === n || (await width(i, j + 1)) > maxW) { ends.push(j); i = j; }
    return text(ends);
  }
  const splits = function* (from, left) {
    if (left === 1) { yield [n]; return; }
    for (let c = from + 1; c <= n - left + 1; c++) for (const rest of splits(c, left - 1)) yield [c, ...rest];
  };
  const soft = (j) => /[.!?:;,…]$/.test(words[j - 1]) || /^[¿¡("“]/.test(words[j]);
  const weak = (w) => /^(?:[\p{Ll}\d]{1,2}|the|and|for|una|los|las|del|con|por|que)$/u.test(w);
  for (let L = 1; L <= Math.min(n, 4); L++) {
    let best = null;
    for (const ends of splits(0, L)) {
      let widest = 0, cost = 0, i = 0;
      for (const j of ends) {
        widest = Math.max(widest, await width(i, j));
        if (j < n) cost += (soft(j) ? 0 : 0.2 * maxW) + (weak(words[j - 1]) ? 0.2 * maxW : 0);
        i = j;
      }
      if (widest <= maxW && (!best || widest + cost < best.cost)) best = { ends, cost: widest + cost };
    }
    if (best) return text(best.ends);
  }
  return null;
}

// Plain "over" of one RGBA image onto another (vips hands back straight, not premultiplied, alpha).
function over(dst, dw, dh, src, sw, sh, left, top) {
  for (let y = Math.max(0, -top); y < Math.min(sh, dh - top); y++)
    for (let x = Math.max(0, -left); x < Math.min(sw, dw - left); x++) {
      const s = (y * sw + x) * 4, d = ((y + top) * dw + x + left) * 4, sa = src[s + 3] / 255;
      if (!sa) continue;
      const da = dst[d + 3] / 255, a = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) dst[d + c] = (src[s + c] * sa + dst[d + c] * da * (1 - sa)) / a;
      dst[d + 3] = a * 255;
    }
}

// Max over a disc: the even, anti-aliased stroke the apps put around each glyph.
function dilate(a, w, h, r) {
  const out = new Uint8Array(a.length), R = Math.ceil(r);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dy * dy > r * r + 0.5) continue;
    for (let y = Math.max(0, -dy); y < Math.min(h, h - dy); y++)
      for (let x = Math.max(0, -dx), o = y * w, s = (y + dy) * w + dx; x < Math.min(w, w - dx); x++) if (a[s + x] > out[o + x]) out[o + x] = a[s + x];
  }
  return out;
}

// The union of one box per line, every corner rounded: outer corners convex, the steps between lines concave,
// the shape the apps draw behind background text.
function boxPath(rows, r) {
  const pts = [];
  rows.forEach((b, i) => { if (i === 0 || b.x1 !== rows[i - 1].x1) { if (i) pts.push([rows[i - 1].x1, b.y0]); pts.push([b.x1, b.y0]); } });
  pts.push([rows.at(-1).x1, rows.at(-1).y1]);
  const left = pts.map(([x, y]) => [rows[0].x0 + rows[0].x1 - x, y]).reverse();
  const poly = [...pts, ...left];
  let d = "";
  poly.forEach((v, i) => {
    const p = poly[(i + poly.length - 1) % poly.length], n = poly[(i + 1) % poly.length];
    const lp = Math.hypot(p[0] - v[0], p[1] - v[1]), ln = Math.hypot(n[0] - v[0], n[1] - v[1]), k = Math.min(r, lp / 2, ln / 2);
    const a = [v[0] + ((p[0] - v[0]) / lp) * k, v[1] + ((p[1] - v[1]) / lp) * k], b = [v[0] + ((n[0] - v[0]) / ln) * k, v[1] + ((n[1] - v[1]) / ln) * k];
    d += `${i ? "L" : "M"}${a[0].toFixed(1)},${a[1].toFixed(1)}Q${v[0].toFixed(1)},${v[1].toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
  });
  return d + "Z";
}

// One text item as a tight transparent PNG, plus where it goes on the 1080x1920 frame.
async function card(text, st, pos) {
  // NFC so a decomposed accent is one glyph; control characters out; the writer's own line breaks are kept.
  const paras = text.normalize("NFC").replace(/[\u0000-\u0009\u000b-\u001f]/g, " ").split("\n").map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const pad = st.fill ? Math.round(st.size * 0.38) : st.outline || 0;
  // Too long for 4 lines at full size: shrink a little at a time, the way you pinch text smaller in the app.
  let size = st.size, lines;
  const cache = new Map();
  for (; ; size = Math.round(size * 0.92)) {
    const force = size < st.size * 0.65;
    lines = [];
    for (const p of paras) lines.push(...((await wrap(st, size, p, Math.min(MAXW, st.measure || MAXW) - 2 * pad, cache, force)) || [null]));
    if (force || (!lines.includes(null) && lines.length <= 4)) break;
  }
  if (!lines.length) throw new Error("overlay: empty text");
  lines = await Promise.all(lines.map((s) => line(st, size, s)));
  const pitch = Math.round(size * st.pitch), capH = lines[0].base - lines[0].cap;
  const blur = st.shadow ? size * 0.07 : 0, m = Math.ceil(pad + 3 * blur + 4);
  const cw = Math.max(...lines.map((l) => l.w)) + 2 * m, top = m + Math.round(st.fill ? (pitch - capH) / 2 : size * 0.25);
  const base = (i) => top + capH + i * pitch;
  const ch = base(lines.length - 1) + Math.round(st.fill ? (pitch - capH) / 2 : size * 0.3) + m;
  const flat = Buffer.alloc(cw * ch * 4), bare = Buffer.alloc(cw * ch * 4);
  lines.forEach((l, i) => {
    over(flat, cw, ch, l.data, l.w, l.h, Math.round((cw - l.w) / 2), base(i) - l.base);
    if (st.outline) over(bare, cw, ch, l.bare, l.w, l.h, Math.round((cw - l.w) / 2), base(i) - l.base);
  });
  const under = [];
  if (st.fill) {
    // Each line's box hugs its own text; lines within a corner's width of each other share a width so the edge stays clean.
    const rows = lines.map((l, i) => ({ half: l.w / 2 + pad, y0: base(i) - capH / 2 - pitch / 2 + size * 0.03, y1: base(i) - capH / 2 + pitch / 2 + size * 0.03 }));
    const r = pitch * 0.27;
    for (let k = 0; k < rows.length; k++) for (const o of [rows[k - 1], rows[k + 1]]) if (o && Math.abs(o.half - rows[k].half) < r) rows[k].half = o.half = Math.max(o.half, rows[k].half);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}"><path fill="${st.fill}" d="${boxPath(rows.map((b) => ({ x0: cw / 2 - b.half, x1: cw / 2 + b.half, y0: b.y0, y1: b.y1 })), r)}"/></svg>`;
    under.push({ input: Buffer.from(svg) });
  } else {
    const alpha = (b) => Uint8Array.from({ length: cw * ch }, (_, i) => b[i * 4 + 3]);
    const dark = (a, k) => { const b = Buffer.alloc(a.length * 4); for (let i = 0; i < a.length; i++) b[i * 4 + 3] = a[i] * k; return b; };
    const raw = { width: cw, height: ch, channels: 4 };
    // The shadow falls from everything, emoji too, as on iOS; the outline only rings the letters.
    if (st.shadow) {
      const a = st.spread ? dilate(alpha(flat), cw, ch, st.spread) : alpha(flat);
      under.push({ input: await sharp(dark(a, st.shadow), { raw }).blur(blur).raw().toBuffer(), raw, top: Math.round(size * 0.03), left: 0 });
    }
    if (st.outline) under.push({ input: dark(dilate(alpha(bare), cw, ch, st.outline), 0.92), raw });
  }
  const png = await sharp({ create: { width: cw, height: ch, channels: 4, background: "#0000" } })
    .composite([...under, { input: flat, raw: { width: cw, height: ch, channels: 4 } }]).png().toBuffer();
  // The block's optical middle (first cap top to last baseline, or the boxes) goes on the anchor, then into the safe zone.
  const mid = st.fill ? (base(0) - capH + base(lines.length - 1)) / 2 + size * 0.03 : (base(0) - capH + base(lines.length - 1)) / 2;
  const y = Math.round(Math.min(Math.max(ANCHOR[pos] - mid, SAFE.top - m), SAFE.bottom + m - ch));
  const x = Math.round(Math.min(CX - cw / 2, SAFE.right + m - cw));
  return { png, x, y };
}

// items: [{ text, start, end, style, pos, fade }]: seconds within the video; style one of TEXT_STYLES; pos "top" | "center"
// | "lower" (default per style); fade optional, e.g. 0.08 s (the apps just cut it in and out). Audio is copied untouched.
export async function overlay(videoIn, items, out) {
  [videoIn, out] = [path.resolve(videoIn), path.resolve(out)];
  const [w, h, rate] = probe(videoIn, "stream=width,height,r_frame_rate").split(",");
  if (+w !== W || +h !== H) throw new Error(`overlay: expects a ${W}x${H} Reel, got ${w}x${h}`);
  const dur = +probe(videoIn, "format=duration"), [num, den = 1] = rate.split("/");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  // A blank line from the writer is skipped, not a failed render.
  items = items.filter((it) => String(it.text ?? "").trim());
  if (!items.length) { fs.copyFileSync(videoIn, out); return out; }
  const tmp = fs.mkdtempSync(path.join(path.dirname(out), ".overlay-"));
  try {
    const graph = [];
    let last = "0:v";
    for (const [i, it] of items.entries()) {
      const st = STYLES[it.style || "classic"], pos = it.pos || st?.pos;
      if (!st || !ANCHOR[pos]) throw new Error(`overlay: unknown style "${it.style}" or pos "${it.pos}"`);
      const { png, x, y } = await card(String(it.text), st, pos);
      fs.writeFileSync(`${tmp}/t${i}.png`, png);
      const s = Math.max(0, +it.start || 0), e = Math.min(dur, it.end ?? dur), f = Math.min(+it.fade || 0, (e - s) / 2);
      // The text comes from a movie= source, not a second -i: our Reels switch colour tags between shots (stills are
      // full range), ffmpeg rebuilds the graph at each switch, and a looped -i input lost sync there (the 10 s Reel came
      // out 16 s long). A source inside the graph just restarts with it.
      graph.push(`movie=t${i}.png,loop=loop=-1:size=1,setpts=N*${den}/${num}/TB` +
        (f > 0 ? `,fade=t=in:st=${s}:d=${f}:alpha=1,fade=t=out:st=${e - f}:d=${f}:alpha=1` : "") + `[t${i}]`);
      // Half-open window, so back-to-back items never share a frame.
      graph.push(`[${last}][t${i}]overlay=${x}:${y}:shortest=1:enable='gte(t,${s})*lt(t,${e})'[v${i}]`);
      last = `v${i}`;
    }
    // Run inside the temp dir so movie= gets bare file names (no filtergraph escaping of the user's path).
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", videoIn, "-filter_complex", graph.join(";"), "-map", `[${last}]`, "-map", "0:a?",
      "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out], { cwd: tmp });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return out;
}
