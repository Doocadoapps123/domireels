// Lab: the real dish on a new surface (src/frames.mjs resurface). The raw Muse frame is kept next to the result.
// Usage: node --env-file=../.env lab/resurface.mjs <real 9:16> <out.jpg> <container> "<surface prompt>" | <Muse frame already made>
import fs from "node:fs";
import { resurface } from "../src/frames.mjs";

const [real, outFile, container, how] = process.argv.slice(2);
const { frame, drawn } = await resurface(fs.readFileSync(real), container, fs.existsSync(how) ? fs.readFileSync(how) : how);
if (!fs.existsSync(how)) fs.writeFileSync(outFile.replace(/\.jpg$/, "-raw.jpg"), drawn);
fs.writeFileSync(outFile, frame);
