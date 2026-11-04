// Lab: build plate cutouts for photos. Usage: node --env-file=../.env lab/cut.mjs lab/photos/*.jpg
import path from "node:path";
import { buildLayers } from "../src/layers.mjs";
await Promise.all(process.argv.slice(2).map(async (p) => {
  const t0 = Date.now();
  const m = await buildLayers(p, `lab/out/layers/${path.basename(p, path.extname(p))}`);
  console.log(path.basename(p), `${Date.now() - t0}ms plates=${m.plates} box=${m.box.width}x${m.box.height} share=${(m.plateShare * 100).toFixed(0)}%`);
}));
