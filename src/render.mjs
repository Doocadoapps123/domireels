// Renders a 1080x1920 reel from shot layers (src/layers.mjs) with code-built motion.
// Each shot: the cleaned scene pushes in slowly while the real dish pushes in faster,
// so the food lifts off the table (2.5D) without any pixel of food being generated.
import { spawn } from "node:child_process";
import fs from "node:fs";
import sharp from "sharp";

export const W = 1080, H = 1920, FPS = 30;

const ease = (t) => 1 - Math.pow(1 - t, 3);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function textSvg(text, alpha) {
  if (!text) return null;
  const lines = text.toUpperCase().split("\n");
  const size = 92, lh = 108, y0 = H * 0.74 - ((lines.length - 1) * lh) / 2;
  const tspans = lines.map((l, i) => `<tspan x="${W / 2}" y="${y0 + i * lh}">${esc(l)}</tspan>`).join("");
  return Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#000" flood-opacity="0.75"/></filter></defs>
    <text text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial" font-weight="800" font-size="${size}"
      fill="#fff" fill-opacity="${alpha}" filter="url(#s)" letter-spacing="1">${tspans}</text></svg>`);
}

// Crop of `layer` (w x h source) that fills the 9:16 frame at zoom z around anchor (ax, ay).
function crop(w, h, base, z, ax, ay) {
  const cw = Math.min(w, W / (base * z)), ch = Math.min(h, H / (base * z));
  const left = Math.round(Math.min(w - cw, Math.max(0, ax - cw / 2)));
  const top = Math.round(Math.min(h - ch, Math.max(0, ay - ch / 2)));
  return { left, top, width: Math.round(cw), height: Math.round(ch) };
}

async function loadShot(shot) {
  const meta = JSON.parse(fs.readFileSync(`${shot.dir}/meta.json`, "utf8"));
  const [scene, dish] = await Promise.all([
    sharp(`${shot.dir}/scene.jpg`).raw().toBuffer({ resolveWithObject: true }),
    sharp(`${shot.dir}/dish.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const { x1, y1, x2, y2 } = meta.dishBox;
  return { ...shot, meta, scene, dish, ax: (x1 + x2) / 2, ay: (y1 + y2) / 2, base: Math.max(W / meta.width, H / meta.height) };
}

async function frame(s, t) {
  const { width: w, height: h } = s.meta;
  const e = ease(t);
  // Punch-in on the cut, then the slow push that separates dish from table.
  const punch = 0.05 * Math.max(0, 1 - t * 6);
  const zBg = 1.02 + punch + 0.05 * e, zDish = 1.02 + punch + 0.11 * e;
  const layer = (src, channels, z) => sharp(src.data, { raw: { width: w, height: h, channels } })
    .extract(crop(w, h, s.base, z, s.ax, s.ay)).resize(W, H, { fit: "fill" });
  const bg = await layer(s.scene, 3, zBg).blur(0.3 + 1.2 * e).toBuffer();
  const dish = await layer(s.dish, 4, zDish).png().toBuffer();
  const parts = [{ input: dish }];
  const text = textSvg(s.text, Math.min(1, t * 5));
  if (text) parts.push({ input: text });
  return sharp(bg, { raw: { width: W, height: H, channels: 3 } }).composite(parts).removeAlpha().raw().toBuffer();
}

export async function renderReel(shots, outFile) {
  const ff = spawn("ffmpeg", ["-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`,
    "-r", `${FPS}`, "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-movflags", "+faststart", outFile],
    { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((ok, fail) => ff.on("close", (c) => (c ? fail(new Error(`ffmpeg ${c}`)) : ok())));
  for (const shot of shots) {
    const s = await loadShot(shot);
    const n = Math.round(shot.seconds * FPS);
    for (let i = 0; i < n; i++) {
      const buf = await frame(s, i / n);
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    }
  }
  ff.stdin.end();
  await done;
}
