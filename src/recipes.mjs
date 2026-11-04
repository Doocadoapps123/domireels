// Muse Spark watches food reels that work and writes down their editing "recipe":
// the hook, every shot with its action and camera, the cut rhythm, the text and the audio's job.
// The director picks from this library instead of inventing a format each time. No footage is reused:
// the reference Reels stay out of the repo, and only Muse's written recipe (data/formats/) is kept, with its link.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.META_API_KEY, maxRetries: 6 });

const RECIPE = {
  type: "object",
  additionalProperties: false,
  required: ["format", "core", "dish", "hook", "people", "shots", "text_on_screen", "audio_role", "why_it_works", "fits", "can_make", "needs_camera"],
  properties: {
    format: { type: "string", description: "Short reusable name, e.g. 'build-up to the money shot'." },
    core: { type: "string", description: "The one idea that makes this Reel work, in one sentence. Everything else is decoration." },
    dish: { type: "string" },
    hook: { type: "string", description: "What happens in the first second that stops the scroll." },
    people: { type: "string", description: "Who is on screen besides the food and what they do: hands only, or a person (age, look, how they are dressed) who shows the dish, carries it, reacts, talks to the camera; how they enter the frame and when. \"nobody\" if only food." },
    shots: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["start", "end", "framing", "action", "camera", "speed"],
        properties: {
          start: { type: "number" }, end: { type: "number" },
          framing: { type: "string", description: "macro, close, medium, overhead, eye level..." },
          action: { type: "string", description: "The one physical thing that happens to the food." },
          camera: { type: "string", description: "static, push in, whip, handheld follow, orbit..." },
          speed: { type: "string", enum: ["slow motion", "real time", "sped up"] },
        },
      },
    },
    text_on_screen: { type: "string" },
    audio_role: { type: "string", description: "Music, ASMR sizzle, voice, trend audio, and how cuts sit on it." },
    why_it_works: { type: "string" },
    fits: { type: "string", description: "Which kinds of dishes this format suits." },
    can_make: { type: "string", description: "What of this Reel we can make for a small restaurant from what we have, shot by shot: its real menu photos, its house cast (AI-drawn models who hold and show the food, never eat), 4 s AI video clips started from a real photo or a drawn frame, and the edit (cuts, text, music)." },
    needs_camera: { type: "string", description: "What only a real camera in the real place can give: the real kitchen or staff, a real crowd, real cooking, a long unbroken take, a person talking. \"nothing\" if we can make all of it." },
  },
};

const PROMPT = `You study food Reels that performed well, to teach a director that makes Reels for small restaurants.
Watch the attached Reel. Measured cut times (seconds) from the file: {CUTS}. Duration {DUR}s.
Write its recipe: the hook, who is on screen and what they do, every shot in order with its time, framing, the one physical action, the camera move and its speed, the on-screen text, and what the audio does.
Then say plainly why it makes people hungry, the one idea at its core, and which dishes the format suits. Be concrete, no marketing words.
Last, be honest about what we could make of it: we have the restaurant's real menu photos, its house cast (AI-drawn models who hold and show the food and never eat), 4 s AI video clips started from a photo, and the edit. Say what we can make and what only a real camera in the real place can give.{NOTE}`;

const dur = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString();
const cuts = (f) => [...spawnSync("ffmpeg", ["-hide_banner", "-i", f, "-vf", "select='gt(scene,0.25)',showinfo", "-f", "null", "-"])
  .stderr.toString().matchAll(/pts_time:([\d.]+)/g)].map((m) => +(+m[1]).toFixed(2));

// `note`: why the person who picked this Reel liked it, in their words; Muse looks for that first.
export async function readRecipe(file, note = "") {
  const f = await client.files.create({ file: fs.createReadStream(file), purpose: "user_data" });
  const res = await client.responses.create({
    model: "muse-spark-1.3",
    input: [{ type: "message", role: "user", content: [
      { type: "input_text", text: PROMPT.replace("{CUTS}", cuts(file).join(", ") || "none").replace("{DUR}", dur(file).toFixed(1)).replace("{NOTE}", note ? `\nThe person who picked this Reel says why they liked it: "${note}". Find that first.` : "") },
      { type: "input_file", file_id: f.id },
    ] }],
    text: { format: { type: "json_schema", name: "recipe", schema: RECIPE, strict: true } },
  });
  return JSON.parse(res.output_text);
}
