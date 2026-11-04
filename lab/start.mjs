// Lab: start frame for the video model = the real plate (SAM cutout) on an empty table made by Muse Image.
// Usage: node --env-file=../.env lab/start.mjs lab/photos/x.jpg   (needs lab/out/layers/<name> from lab/cut.mjs)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { tableScene, plateOnTable } from "../src/layers.mjs";

const photo = process.argv[2], name = path.basename(photo, path.extname(photo));
const dir = `lab/out/layers/${name}`;
const t0 = Date.now();
const table = fs.existsSync("lab/out/table.jpg") ? fs.readFileSync("lab/out/table.jpg") : await tableScene();
fs.writeFileSync("lab/out/table.jpg", table);
const meta = JSON.parse(fs.readFileSync(`${dir}/meta.json`, "utf8"));
const { frame, plateRect, cut, scale } = await plateOnTable(fs.readFileSync(`${dir}/plate.png`), table, meta);
fs.writeFileSync(`${dir}/start.jpg`, frame);
fs.writeFileSync(`${dir}/start.json`, JSON.stringify(plateRect));
await sharp(frame).resize({ height: 700 }).toFile(`lab/out/peek/${name}-start.jpg`);
console.log(`${dir}/start.jpg ${Date.now() - t0}ms`, plateRect, cut, scale);
