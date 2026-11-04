// More real equipment for the Reels, so every restaurant does not get the same fryer. Muse searches free stock
// (Mixkit, only clips under its Stock Video Free License: commercial use, ads and social media, no credit needed),
// watches each clip and keeps the ones with no food, no faces and no logos, with the moments worth cutting in.
// Kept clips land in data/stock.json, the library the planner picks from.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { judgeStock } from "./director.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const LIBRARY = "data/stock.json", LICENSE = "Mixkit Stock Video Free License (commercial use, no attribution)";
const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a]);
const get = async (url) => { const r = await fetch(url, { headers: { "User-Agent": UA } }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r; };

// The clips a Mixkit tag page lists (its search page fills in by script, the tag pages do not).
export async function search(tag) {
  const html = await (await get(`https://mixkit.co/free-stock-video/${tag}/`)).text(), out = new Map();
  for (const [, slug, id] of html.matchAll(/href="\/free-stock-video\/([a-z0-9-]+)-(\d+)\/"/g))
    out.set(id, { title: slug.replace(/-/g, " "), page: `https://mixkit.co/free-stock-video/${slug}-${id}/`,
      url: `https://assets.mixkit.co/videos/${id}/${id}-720.mp4`, preview: `https://assets.mixkit.co/videos/${id}/${id}-360.mp4` });
  return [...out.values()];
}

// The license sits on each clip's own page; the search data is not reliable about it.
const isFree = async (page) => (await (await get(page)).text()).includes('data-license="videoFree"');

// Frames every second, stamped with the time, for Muse to name exact moments.
async function sheet(video, file) {
  const tmp = `${file}.d`;
  fs.mkdirSync(tmp, { recursive: true });
  ff("-i", video, "-vf", "fps=1,scale=320:-2", "-frames:v", "24", `${tmp}/%02d.jpg`);
  const frames = fs.readdirSync(tmp).sort(), { height } = await sharp(`${tmp}/${frames[0]}`).metadata();
  const cells = await Promise.all(frames.map(async (fr, i) => [
    { input: fs.readFileSync(`${tmp}/${fr}`), left: (i % 6) * 320, top: Math.floor(i / 6) * height },
    { input: Buffer.from(`<svg width="64" height="30"><rect width="64" height="30" fill="black"/><text x="8" y="22" font-family="Helvetica" font-size="20" font-weight="bold" fill="yellow">${i}s</text></svg>`), left: (i % 6) * 320, top: Math.floor(i / 6) * height },
  ]));
  await sharp({ create: { width: 1920, height: height * Math.ceil(frames.length / 6), channels: 3, background: "#000" } }).composite(cells.flat()).jpeg({ quality: 85 }).toFile(file);
  fs.rmSync(tmp, { recursive: true });
  return fs.readFileSync(file);
}

const size = (f) => execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f]).toString().trim().split(",").map(Number);

// Muse judges up to `per` new clips for each query; kept ones are added to the library with a 9:16 crop per moment,
// in the pixels of the full-size file the render downloads.
export async function grow(queries, { per = 6, work = "lab/out/stock" } = {}) {
  fs.mkdirSync(work, { recursive: true });
  const library = JSON.parse(fs.readFileSync(LIBRARY, "utf8")), seen = new Set(library.map((s) => s.page || s.url));
  const tried = `${work}/tried.json`, done = new Set(fs.existsSync(tried) ? JSON.parse(fs.readFileSync(tried, "utf8")) : []);
  for (const q of queries) {
    for (const c of (await search(q)).filter((c) => !seen.has(c.page) && !done.has(c.page)).slice(0, per)) {
      done.add(c.page); seen.add(c.page);
      fs.writeFileSync(tried, JSON.stringify([...done], null, 1));
      try {
        if (!(await isFree(c.page))) { console.log(`skip (restricted license): ${c.title}`); continue; }
        const id = c.url.match(/\/(\d+)-\d+\.mp4/)[1], small = `${work}/${id}-360.mp4`, big = `${work}/${id}.mp4`;
        fs.writeFileSync(small, Buffer.from(await (await get(c.preview)).arrayBuffer()));
        const v = await judgeStock(small, await sheet(small, `${work}/${id}.jpg`), c.title);
        if (!v.keep || !v.moments.length) { console.log(`rejected: ${c.title}: ${v.reason}`); continue; }
        fs.writeFileSync(big, Buffer.from(await (await get(c.url)).arrayBuffer()));
        const [w, h] = size(big), cw = Math.round((h * 9) / 16), wide = w > cw + 2;
        const name = library.some((s) => s.name === v.name) ? `${v.name}-${id}` : v.name;
        library.push({ name, what: v.what, url: c.url, page: c.page, license: LICENSE, by: "muse", query: q,
          moments: v.moments.map((m) => ({ at: m.at, dur: m.dur, what: m.what,
            ...(wide ? { crop: `${cw}:${h}:${Math.round(Math.min(w - cw, Math.max(0, m.x * w - cw / 2)))}:0` } : {}) })) });
        fs.writeFileSync(LIBRARY, JSON.stringify(library, null, 2) + "\n");
        console.log(`kept ${name}: ${v.what}`);
      } catch (e) { console.log(`error on ${c.title}: ${e.message}`); }
    }
  }
  return library;
}

// What a clip shows belongs to the first restaurant that uses it: no two restaurants share footage (Yansel, 2 Nov: Balis
// and Dora both got the same grill flames, "Imaginate 100 restaurante con el mismisimo reel"). A look, not a file: the
// library's ten flame clips are one group ("fire"), because Dora's next Reel took another flame clip and it read as the
// same grill again. One file per group in data/stock-claims, created with "wx" so two runs planning at the same moment
// cannot both take it. When the library runs out, groups will be assigned on purpose; until then another restaurant's
// group is never offered.
const CLAIMS = "data/stock-claims";
export const owners = () => fs.existsSync(CLAIMS) ? Object.fromEntries(fs.readdirSync(CLAIMS).filter((f) => f.endsWith(".json"))
  .map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(`${CLAIMS}/${f}`, "utf8")).restaurant])) : {};
// A clip saved in an older script carries no group: the library knows it.
export const groupOf = (clip) => clip.group || JSON.parse(fs.readFileSync(LIBRARY, "utf8")).find((x) => x.name === clip.name)?.group || clip.name;
export function claim(name, restaurant, run) {
  fs.mkdirSync(CLAIMS, { recursive: true });
  try { fs.writeFileSync(`${CLAIMS}/${name}.json`, JSON.stringify({ restaurant, run, date: new Date().toLocaleDateString("en-CA") }) + "\n", { flag: "wx" }); }
  catch (e) { if (e.code !== "EEXIST") throw e; }
  return owners()[name] === restaurant;
}
