// Food never vanishes. Inside one continuous take of a draft, every piece of food in its first frame must still be in
// its last one, whole and separate, on the plate or in the hand. In Dora's shot 2 a taco melted into the one the hand
// lifted and Muse's review approved it with realism 8; counting each frame apart wandered (lab/counttest2.mjs).
// Following each piece from the take's first frame to its last caught it and passed the good takes (lab/counttest3.mjs).
// A hard cut inside the clip (a wide shot that jumps to a close-up) starts a new take: framing changes, so only frames of
// the same take are compared.
import { execFileSync, spawnSync } from "node:child_process";
import { ask } from "./director.mjs";

const FOLLOW = {
  type: "object", additionalProperties: false, required: ["pieces", "all_accounted"],
  properties: {
    pieces: { type: "array", items: { type: "object", additionalProperties: false, required: ["in_a", "in_b"], properties: {
      in_a: { type: "string", description: "Where it is in frame A." },
      in_b: { type: "string", description: "Where that same piece is in frame B, or \"missing\" or \"merged into another\"." },
    } } },
    all_accounted: { type: "boolean" },
  },
};

const seconds = (video) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video]).toString();
const grab = (video, t) => execFileSync("ffmpeg", ["-v", "error", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=iw*2:-1:flags=lanczos", "-f", "image2", "-c:v", "mjpeg", "-q:v", "2", "-"]);
const image = (jpg) => ({ type: "input_image", image_url: `data:image/jpeg;base64,${jpg.toString("base64")}` });

// The clip's takes, as [start, end] in seconds, split at the hard cuts the video model put inside it.
export function takes(video) {
  const log = spawnSync("ffmpeg", ["-i", video, "-vf", "select='gt(scene,0.25)',showinfo", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const cuts = [...log.matchAll(/pts_time:([\d.]+)/g)].map((m) => +m[1]), end = seconds(video);
  return [0, ...cuts, end].slice(0, -1).map((t, i, a) => [t, i + 1 < a.length ? a[i + 1] : end]);
}

// Problems, one per take that lost food; empty when every piece is accounted for. Takes under 0.6 s are too short to judge.
export async function lostFood(video) {
  const problems = [];
  for (const [t0, t1] of takes(video).filter(([a, b]) => b - a >= 0.6)) {
    const r = await ask([
      { type: "input_text", text: `Frame A is the start of one continuous take of a food clip; frame B is the end of the same take. Real food cannot vanish, merge or split unless a hand visibly eats, cuts or adds it.
List every separate piece of food you see in frame A (a taco, a slice, a wing, a cup of broth; a pile of fries or rice counts as one pile), one by one, and say where that same piece is in frame B: on the plate, in the hand, or "missing" / "merged into another". all_accounted is true only if every piece of A is still a separate, whole piece in B, or a hand visibly changed it.` },
      { type: "input_text", text: "Frame A:" }, image(grab(video, t0 + 0.05)), { type: "input_text", text: "Frame B:" }, image(grab(video, t1 - 0.1)),
    ], "follow", FOLLOW);
    if (!r.all_accounted) problems.push(`${t0.toFixed(1)}-${t1.toFixed(1)} s: food vanished or merged (${r.pieces.filter((p) => /missing|merged/i.test(p.in_b)).map((p) => p.in_a).join("; ") || "a piece is not accounted for"})`);
  }
  return problems;
}

// Takes that left the first frame's scene. The video model sometimes cuts inside a clip to a place it draws itself, with
// food it draws too: Dora's quesadilla on a plate cut in 0.3 s to drawn quesadillas on a drawn griddle (3 Nov). A color
// histogram of the take against the first frame tells them apart: those cut-aways scored 0.18-0.42, a punch-in on the
// same plate 0.79 and a continuous take 0.89-0.99.
const hist = async (jpg) => {
  const { default: sharp } = await import("sharp");
  const data = await sharp(jpg).resize(36, 64, { fit: "fill" }).removeAlpha().raw().toBuffer(), h = new Array(512).fill(0);
  for (let i = 0; i < data.length; i += 3) h[(data[i] >> 5) * 64 + (data[i + 1] >> 5) * 8 + (data[i + 2] >> 5)]++;
  return h;
};
const corr = (a, b) => {
  const n = a.length, ma = a.reduce((x, y) => x + y) / n, mb = b.reduce((x, y) => x + y) / n;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return s / Math.sqrt(sa * sb || 1);
};
export async function cutAways(video, min = 0.6) {
  const start = await hist(grab(video, 0)), away = [];
  for (const [t0, t1] of takes(video).slice(1)) {
    const c = corr(start, await hist(grab(video, Math.min(t1 - 0.05, t0 + 0.3))));
    if (c < min) away.push({ at: t0, dur: t1 - t0, why: `the video cut away from the restaurant's own frame (look ${c.toFixed(2)})` });
  }
  return away;
}
