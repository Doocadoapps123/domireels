// Lab: Muse watches reference Reels and writes down how each one works (src/recipes.mjs) into data/formats/.
// Usage: node --env-file=../.env lab/recipes.mjs <reel.mp4>[=<its link>[=<why it was picked>]] ... [--again]
//   The video stays out of the repo (lab/inspo/ is ignored); only Muse's written recipe and its link are kept,
//   the link without its share-tracking query (it identifies who shared it). --again studies a Reel again.
//   The Reels themselves are private study material: they never get republished, shown in the demo or committed.
import fs from "node:fs";
import path from "node:path";
import { readRecipe } from "../src/recipes.mjs";

fs.mkdirSync("data/formats", { recursive: true });
await Promise.all(process.argv.slice(2).filter((a) => !a.startsWith("--")).map(async (arg) => {
  const [, file, link = "", note = ""] = arg.match(/^([^=]+)(?:=([^=]*))?(?:=(.*))?$/), out = `data/formats/${path.basename(file, path.extname(file))}.json`;
  const old = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : null;
  if (old && !process.argv.includes("--again")) return;
  const source = link.split("?")[0] || old?.source || "", why = note || old?.picked_because || "", t0 = Date.now();
  try {
    const r = await readRecipe(file, why);
    fs.writeFileSync(out, JSON.stringify({ ...r, source, ...(why ? { picked_because: why } : {}), studied_by: "muse-spark-1.3" }, null, 2) + "\n");
    console.log(`${file}: ${r.format} | ${r.people} | ${r.shots.length} shots | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } catch (e) { console.log(`${file}: ${String(e).slice(0, 300)}`); }
}));
