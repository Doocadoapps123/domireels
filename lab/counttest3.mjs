// Lab: Muse follows each piece from the first frame of a take to its last (same framing), instead of counting frames apart.
// Usage: node --env-file=../.env lab/counttest3.mjs <piece> <video> <end second>...  (pairs of video and end second)
// Result (Dora, 2 Nov): caught the taco that merged in draft-2-0 and passed draft-4-1, draft-5-0 and draft-2-0 before the merge. Now src/vanish.mjs.
import { execFileSync } from "node:child_process";
import { ask } from "../src/director.mjs";

const [piece, ...rest] = process.argv.slice(2);
const SCHEMA = { type: "object", additionalProperties: false, required: ["pieces", "all_accounted"], properties: {
  pieces: { type: "array", items: { type: "object", additionalProperties: false, required: ["in_a", "in_b"], properties: {
    in_a: { type: "string", description: "Where it is in frame A." }, in_b: { type: "string", description: "Where that same piece is in frame B, or \"missing\" or \"merged into another\"." } } } },
  all_accounted: { type: "boolean" } } };
const grab = (v, t) => execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", v, "-frames:v", "1", "-vf", "scale=iw*2:-1:flags=lanczos", "-f", "image2", "-c:v", "mjpeg", "-q:v", "2", "-"]);
const url = (b) => ({ type: "input_image", image_url: `data:image/jpeg;base64,${b.toString("base64")}` });
for (let i = 0; i < rest.length; i += 2) {
  const [v, end] = [rest[i], +rest[i + 1]];
  const r = await ask([{ type: "input_text", text: `Frame A is the start of one continuous take of a food clip; frame B is the end of the same take. Real food cannot vanish, merge or split unless a hand visibly eats or cuts it.
List every ${piece} you see in frame A, one by one, and say where that same ${piece} is in frame B: still on the plate, in the hand, or "missing" / "merged into another". all_accounted is true only if every ${piece} of A is a separate, whole ${piece} in B.` },
    { type: "input_text", text: "Frame A:" }, url(grab(v, 0.1)), { type: "input_text", text: "Frame B:" }, url(grab(v, end))], "follow", SCHEMA);
  console.log(v.split("/").pop(), end, r.all_accounted, r.pieces.map((p) => `${p.in_a} -> ${p.in_b}`).join(" | "));
}
