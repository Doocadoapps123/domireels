// Lab: a Reel's storyboard before any video is paid for. One row per shot: its first frame, its last frame when it has
// one, and what Muse wrote for it. The owner agrees on the idea from this sheet (cents), then the video is shot.
// Usage: node lab/board.mjs <run dir>   ->   <run dir>/board.jpg
import fs from "node:fs";
import sharp from "sharp";

const dir = process.argv[2], script = JSON.parse(fs.readFileSync(`${dir}/script.json`, "utf8"));
const W = 270, H = 480, T = 520, f = (n) => `${dir}/${n}.jpg`;
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Wraps a line to the text column, about 46 characters a line.
const wrap = (t, n = 46) => String(t).split(/\s+/).reduce((a, w) => ((a.at(-1) + " " + w).trim().length > n ? [...a, w] : [...a.slice(0, -1), (a.at(-1) + " " + w).trim()]), [""]);

const frameOf = (s) => (s.kind === "diner" || s.kind === "guest" ? f(`start-${s.n}`) : s.kind === "still" ? f(`still-${s.n}`) : s.kind === "build" || s.kind === "trick" ? f(s.start) : null);
const rows = [];
for (const s of script.shots) {
  const a = frameOf(s), b = s.kind === "build" && s.end ? (s.end === "real" && s.dish && fs.existsSync(f(`real-${s.dish}`)) ? f(`real-${s.dish}`) : f(s.end)) : null;
  const lines = [`${s.n}. ${s.kind}${s.kind === "build" ? ` ${s.start} > ${s.end || "?"}` : s.kind === "stock" ? ` ${s.stock}` : ""}`, ...wrap(s.what), "", ...wrap(s.motion || "", 52).slice(0, 9)];
  rows.push({ a, b, lines });
}
const head = [`${script.concept}  (${script.seconds} s, ${script.rhythm || ""})`, ...wrap(`music: ${script.music?.register || ""}. ${script.music?.prompt || "no music"}`, 95).slice(0, 3), ...wrap(`text (${script.text_style || "none"}): ${(script.texts || []).map((x) => `"${x.text}"`).join("  ")}`, 95)];
const top = 30 + head.length * 26;
const svgText = (lines, size, w, h, weight = "normal") => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:Helvetica;fill:#eee}</style>${lines.map((l, i) => `<text x="10" y="${size + 6 + i * (size + 6)}" font-size="${size}" font-weight="${i === 0 ? "bold" : weight}">${esc(l)}</text>`).join("")}</svg>`);
const layers = [{ input: svgText(head, 20, 2 * W + T, top), left: 0, top: 0 }];
for (const [i, r] of rows.entries()) {
  const y = top + i * (H + 10);
  for (const [j, p] of [r.a, r.b].entries()) if (p && fs.existsSync(p)) layers.push({ input: await sharp(p).resize(W, H, { fit: "cover" }).toBuffer(), left: j * W, top: y });
  layers.push({ input: svgText(r.lines, 17, T, H), left: 2 * W + 10, top: y });
}
await sharp({ create: { width: 2 * W + T, height: top + rows.length * (H + 10), channels: 3, background: "#151111" } }).composite(layers).jpeg({ quality: 82 }).toFile(`${dir}/board.jpg`);
console.log(`${dir}/board.jpg`);
