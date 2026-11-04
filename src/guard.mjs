// The food-truth guard: a generated clip is only used if the dish in it is still the real dish.
//   1. SAM 3.1 tracks the plate through the clip (does it stay one stable object, no pops or warps?)
//   2. Muse Spark compares the real plate with frames of the clip and the clip itself, and approves or rejects.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import OpenAI from "openai";
import sharp from "sharp";
import { parseVideoStream, recordsOfKind, frameIndexOf } from "@meta-sam/parser";

const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.META_API_KEY, maxRetries: 6 });
const ANALYSIS_FPS = 8, ANALYSIS_W = 540;

const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);

async function upload(file) {
  const f = await client.files.create({ file: fs.createReadStream(file), purpose: "user_data" });
  return f.id;
}

// Per analysed frame: the plate's box and area share. The largest "plate" object is the dish.
async function trackPlate(fileId, frames) {
  const events = await client.responses.create({
    model: "sam-3.1",
    input: [{ type: "message", role: "user", content: [
      { type: "input_text", text: "plate" }, { type: "input_video", file_id: fileId },
    ] }],
    stream: true,
  });
  const result = await parseVideoStream(events).finalResult;
  const perFrame = new Map();
  for (const b of recordsOfKind(result.records, "box")) {
    const f = frameIndexOf(b), area = (b.right - b.left) * (b.bottom - b.top);
    if (!perFrame.has(f) || perFrame.get(f).area < area) perFrame.set(f, { ...b, area });
  }
  return Array.from({ length: frames }, (_, f) => perFrame.get(f) ?? null);
}

function trackStats(track, w, h) {
  const seen = track.filter(Boolean);
  const share = track.map((b) => (b ? b.area / (w * h) : 0));
  let maxJump = 0;
  for (let i = 1; i < share.length; i++) if (share[i] && share[i - 1]) maxJump = Math.max(maxJump, Math.abs(share[i] / share[i - 1] - 1));
  return {
    visible: seen.length / track.length,
    shareFirst: +share[0].toFixed(3),
    shareLast: +share[share.length - 1].toFixed(3),
    maxFrameJump: +maxJump.toFixed(3),
  };
}

const VERDICT = {
  type: "object",
  additionalProperties: false,
  required: ["food_identical", "approved", "realism", "issues"],
  properties: {
    food_identical: { type: "boolean", description: "Every food item matches the real photo: same items, count, shape, size, color, texture, placement." },
    approved: { type: "boolean" },
    realism: { type: "integer", description: "0-10, how real the clip looks as footage, ignoring the food check." },
    issues: { type: "array", items: { type: "string" }, description: "Concrete problems, each naming the moment and the item." },
  },
};

const GUARD_PROMPT = `You guard the truth of a restaurant's food ad. A diner who orders must receive exactly what the ad shows.
Image 1 is the REAL plate, from the restaurant's own photo. The next images are frames from an AI-generated clip of that plate, at the times given; the clip itself is attached too.
Allowed in the clip: a hand, a utensil, lime juice drops, steam, sauce being poured if the brief asks for it, camera movement, light changes.
Not allowed: any food item added, removed, merged, resized, reshaped, recolored or moved on the plate; food that turns smooth, waxy or plastic; a different plate; morphing, melting or flicker; extra or broken fingers.
Brief for this clip: {BRIEF}
Compare item by item. Be strict: if you are not sure the food is the same, it is not approved.`;

export async function guardClip({ clip, reference, brief, workDir }) {
  fs.mkdirSync(workDir, { recursive: true });
  const t0 = Date.now();
  const ana = `${workDir}/analysis.mp4`;
  ff("-i", clip, "-an", "-vf", `fps=${ANALYSIS_FPS},scale=${ANALYSIS_W}:-2`, "-c:v", "libx264", "-pix_fmt", "yuv420p", ana);
  const probe = execFileSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0",
    "-show_entries", "stream=nb_read_frames,width,height", "-of", "csv=p=0", ana]).toString().trim().split(",").map(Number);
  const [w, h, frames] = probe;
  const fileId = await upload(ana);

  // Four frames across the clip, full resolution, for the side-by-side check.
  const dur = +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", clip]).toString();
  const times = [0.15, 0.4, 0.65, 0.95].map((p) => +(p * dur).toFixed(2));
  const shots = times.map((t, i) => {
    const out = `${workDir}/frame-${i}.jpg`;
    ff("-ss", String(t), "-i", clip, "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "3", out);
    return out;
  });
  const img = async (file) => ({
    type: "input_image",
    image_url: `data:image/jpeg;base64,${(await sharp(file).resize({ width: 720, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()).toString("base64")}`,
  });

  const [track, spark] = await Promise.all([
    trackPlate(fileId, frames),
    client.responses.create({
      model: "muse-spark-1.3",
      input: [{ type: "message", role: "user", content: [
        { type: "input_text", text: GUARD_PROMPT.replace("{BRIEF}", brief) },
        await img(reference),
        ...(await Promise.all(shots.map(async (s, i) => [{ type: "input_text", text: `Clip frame at ${times[i]}s:` }, await img(s)]))).flat(),
        { type: "input_file", file_id: fileId },
      ] }],
      text: { format: { type: "json_schema", name: "verdict", schema: VERDICT, strict: true } },
    }),
  ]);
  const verdict = JSON.parse(spark.output_text);
  const sam = trackStats(track, w, h);
  // SAM vetoes on its own: the plate must stay one object through the clip, with no sudden size pops.
  const samOk = sam.visible >= 0.9 && sam.maxFrameJump < 0.25;
  const approved = verdict.approved && verdict.food_identical && samOk;
  const report = { approved, samOk, sam, spark: verdict, seconds: Math.round((Date.now() - t0) / 1000) };
  fs.writeFileSync(`${workDir}/guard.json`, JSON.stringify(report, null, 2));
  return report;
}
