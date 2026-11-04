// Lab: run the food-truth guard on a generated clip.
// Usage: node --env-file=../.env lab/guard.mjs clip.mp4 reference.jpg "brief"
import path from "node:path";
import { guardClip } from "../src/guard.mjs";
const [clip, reference, brief = "A hand squeezes a lime over the plate."] = process.argv.slice(2);
const report = await guardClip({ clip, reference, brief, workDir: `lab/out/guard/${path.basename(clip, ".mp4")}` });
console.log(JSON.stringify(report, null, 2));
