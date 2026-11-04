// Lab: does SAM 3.1 count the pieces of a dish frame by frame in a draft? A piece that vanishes should show as a drop.
// Usage: node --env-file=../.env lab/counttest.mjs <concept> <video>...
// Result (Dora, 2 Nov): "taco" finds nothing on the plate and "food" sees the whole plate as one object. SAM cannot count the tacos.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import OpenAI from "openai";
import { parseVideoStream, recordsOfKind, frameIndexOf } from "@meta-sam/parser";

const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.META_API_KEY });
const [concept, ...videos] = process.argv.slice(2);
for (const v of videos) {
  const ana = `/tmp/count-${process.pid}.mp4`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", v, "-an", "-vf", "fps=6,scale=540:-2", "-c:v", "libx264", "-pix_fmt", "yuv420p", ana]);
  const f = await client.files.create({ file: fs.createReadStream(ana), purpose: "user_data" });
  const events = await client.responses.create({ model: "sam-3.1", stream: true,
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text: concept }, { type: "input_video", file_id: f.id }] }] });
  const r = await parseVideoStream(events).finalResult;
  const per = new Map();
  for (const b of recordsOfKind(r.records, "box")) {
    const i = frameIndexOf(b);
    if (!per.has(i)) per.set(i, new Set());
    per.get(i).add(b.objectId);
  }
  const n = Math.max(...per.keys()) + 1;
  console.log(v.split("/").pop(), concept, Array.from({ length: n }, (_, i) => per.get(i)?.size ?? 0).join(" "),
    "ids:", [...new Set(recordsOfKind(r.records, "box").map((b) => b.objectId))].join(","));
  fs.rmSync(ana);
}
