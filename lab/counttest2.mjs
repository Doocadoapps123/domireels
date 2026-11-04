// Lab: can Muse count the pieces of a dish frame by frame, as a narrow question instead of a whole review?
// Usage: node --env-file=../.env lab/counttest2.mjs <piece> <video>...
// Result (Dora, 2 Nov): on the wide frames the count is right (draft-2-0 goes from 3 tacos to 2, the one that vanished;
// draft-4-1 and 5-0 keep 2 on the plate + 1 in the hand). After the clip jumps to a close-up the counts wander (1+1, 2+1),
// so a gate built on this can only compare frames with the first frame's framing.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { ask } from "../src/director.mjs";

const [piece, ...videos] = process.argv.slice(2);
const SCHEMA = { type: "object", additionalProperties: false, required: ["whole_plate_in_view", "on_plate", "in_hand"],
  properties: { whole_plate_in_view: { type: "boolean" }, on_plate: { type: "integer" }, in_hand: { type: "integer" } } };
for (const v of videos) {
  const rows = await Promise.all([0.1, 0.6, 1.1, 1.6, 2.1, 2.6, 3.1, 3.6, 3.95].map(async (t) => {
    const jpg = execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", v, "-frames:v", "1", "-f", "image2", "-c:v", "mjpeg", "-q:v", "3", "-"]);
    const r = await ask([{ type: "input_text", text: `Count the whole ${piece}s you can see in this frame. on_plate: ${piece}s lying on the plate. in_hand: ${piece}s held by a hand or lifted off the plate. Count only what is visible; a ${piece} cut off by the frame edge counts if you can tell it is a separate ${piece}.` },
      { type: "input_image", image_url: `data:image/jpeg;base64,${jpg.toString("base64")}` }], "count", SCHEMA);
    return `${t}s:${r.on_plate}+${r.in_hand}${r.whole_plate_in_view ? "" : "(part)"}`;
  }));
  console.log(v.split("/").pop(), rows.join("  "));
}
