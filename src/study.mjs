// A deep read of one reference Reel, focused on what makes it look REAL and what makes it creative,
// so the director learns from footage people actually stopped for. Measured cuts come from the file.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.META_API_KEY, maxRetries: 6 });
const str = { type: "string" }, strs = { type: "array", items: str };

const STUDY = {
  type: "object", additionalProperties: false,
  required: ["idea", "setting", "dishes_on_screen", "people", "camera", "light", "hook", "shots", "peak", "ending", "text_on_screen", "audio", "realism_signals", "craving_signals", "imperfections", "why_it_works", "domi_plan", "domi_risk", "feasible_for_domi"],
  properties: {
    idea: { type: "string", description: "The creative concept in one plain sentence." },
    setting: { type: "string", description: "Where it is shot: kitchen line, restaurant table, car, street, counter. What is in the background." },
    dishes_on_screen: { type: "integer", description: "Most distinct dishes visible at once." },
    people: { type: "string", description: "Who is visible: hands (bare or gloved, how many), arms, torsos, faces. Who they seem to be (cook, diner)." },
    camera: { type: "string", description: "Phone or pro camera, handheld or tripod, angle, movement, focus pulls, lens feel." },
    light: { type: "string", description: "Light source, warmth, shadows, highlights on the food." },
    hook: { type: "string", description: "Exactly what happens in the first second." },
    shots: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["start", "end", "what", "camera", "why_real"],
        properties: {
          start: { type: "number" }, end: { type: "number" },
          what: { type: "string", description: "What happens to the food, physically." },
          camera: str,
          why_real: { type: "string", description: "The concrete detail in this shot that reads as real footage." },
        },
      },
    },
    peak: { type: "string", description: "The second of maximum craving and what happens there." },
    ending: { type: "string", description: "How it ends: loop, last bite, text, logo, cut on action." },
    text_on_screen: strs,
    audio: { type: "string", description: "What you hear: music (genre, tempo), ASMR (sizzle, crunch), voice, and how cuts sit on the beat. Say 'not audible to me' if you cannot hear it." },
    realism_signals: { ...strs, description: "Concrete details that make it read as real footage: shake, motion blur, uneven light, crumbs, drips, mess, steam, real background, imperfect portions." },
    craving_signals: strs,
    imperfections: { ...strs, description: "Things a generated video would make too perfect, that this footage keeps messy." },
    why_it_works: str,
    domi_plan: { type: "string", description: "How Domi could make a Reel with this flow for a small restaurant from one real photo of a dish plus image and video models, step by step." },
    domi_risk: { type: "string", description: "Where a video model would break realism in that plan." },
    feasible_for_domi: { type: "integer", description: "0-10: how real our version could look." },
  },
};

const PROMPT = `You study food Reels that performed well, to teach the director of a studio that makes Reels for small restaurants with image and video models.
The only goal: our Reels must look like REAL footage and make people hungry. Watch the attached Reel frame by frame (and listen, if you can).
Measured cut times (seconds) from the file: {CUTS}. Duration {DUR}s.
Describe every shot with its time. For each, name the concrete detail that makes it read as real (not "looks real": the specific shake, steam, drip, crumb, shadow, background).
List the imperfections a generated video would clean up. Be concrete and literal, no marketing words.`;

export const duration = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString();
export const cuts = (f) => [...spawnSync("ffmpeg", ["-hide_banner", "-i", f, "-vf", "select='gt(scene,0.25)',showinfo", "-f", "null", "-"])
  .stderr.toString().matchAll(/pts_time:([\d.]+)/g)].map((m) => +(+m[1]).toFixed(2));

export async function study(file) {
  const f = await client.files.create({ file: fs.createReadStream(file), purpose: "user_data" });
  const c = cuts(file), d = duration(file);
  const res = await client.responses.create({
    model: "muse-spark-1.3",
    input: [{ type: "message", role: "user", content: [
      { type: "input_text", text: PROMPT.replace("{CUTS}", c.join(", ") || "none").replace("{DUR}", d.toFixed(1)) },
      { type: "input_file", file_id: f.id },
    ] }],
    text: { format: { type: "json_schema", name: "study", schema: STUDY, strict: true } },
  });
  return { duration: +d.toFixed(1), cuts: c, ...JSON.parse(res.output_text) };
}
