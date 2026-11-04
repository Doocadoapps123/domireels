// Muse Spark as the creative director of a Reel, from one real photo of a dish.
//   1. The dish card (src/dish.mjs): what the dish is and how THIS kitchen makes it, with the owner's answers.
//   2. ideate: concepts built for craving, inside what our tools can do without losing realism.
//   3. pick: a separate Muse Spark call, blind to the ideation, judges them like a tough editor and a chef.
//   4. checkFrame: before any paid video call, every drawn frame is compared with the real photo.
//   5. reviewDraft / reviseClip: Muse watches each cheap draft, and rewrites the shot when it fails.
// The playbook (data/playbook.json) is Domi's taste memory: every verdict goes in, every pitch reads it.
import fs from "node:fs";
import OpenAI from "openai";
import sharp from "sharp";
import { AXES, STYLES } from "./ideas.mjs";

// maxRetries: a dropped connection to api.meta.ai (a 10 s connect timeout) killed Dora's run mid-cut on 2 Nov.
const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.META_API_KEY, maxRetries: 6 });
const MODEL = "muse-spark-1.3";

export const img = async (buf) => ({
  type: "input_image",
  image_url: `data:image/jpeg;base64,${(await sharp(buf).rotate().resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer()).toString("base64")}`,
});
// effort: "minimal" for WhatsApp, where the owner is waiting (a "hi" took 12 s at the default; minimal answers in ~2 s).
export async function ask(content, name, schema, { effort } = {}) {
  const res = await client.responses.create({
    model: MODEL,
    ...(effort ? { reasoning: { effort } } : {}),
    input: [{ type: "message", role: "user", content }],
    text: { format: { type: "json_schema", name, schema, strict: true } },
  });
  return JSON.parse(res.output_text);
}

// Muse with the web: it searches, reads its sources and answers in prose with the urls it used (src/trends.mjs).
export async function research(text) {
  const res = await client.responses.create({ model: MODEL, tools: [{ type: "web_search" }], input: [{ type: "message", role: "user", content: [{ type: "input_text", text }] }] });
  const sources = [...new Set(res.output.filter((o) => o.type === "message").flatMap((o) => o.content.flatMap((c) => (c.annotations || []).map((a) => a.url)).filter(Boolean)))];
  return { text: res.output_text, sources, searches: res.output.filter((o) => o.type === "web_search_call").map((o) => o.action?.query).filter(Boolean) };
}

export const loadRecipes = (dir = "data/formats") => fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => ({ id: f.slice(0, -5), ...JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8")) }));
// On the server a run also gets what owners taught through Domi Reels (DR_LESSONS, written by src/server/worker.mjs):
// the global lessons, which never name anyone, and this restaurant's own.
export const loadPlaybook = (file = "data/playbook.json") => {
  const p = JSON.parse(fs.readFileSync(file, "utf8")), extra = process.env.DR_LESSONS;
  if (extra && fs.existsSync(extra)) p.taste = [...p.taste, ...JSON.parse(fs.readFileSync(extra, "utf8"))];
  return p;
};
const playbookText = (p) => [
  "Taste:", ...p.taste.map((t) => `- ${t}`),
  "Proven moves (our video model did these well):", ...p.proven.map((m) => `- ${m.move} (${m.evidence})`),
  "Failed moves (never repeat):", ...p.failed.map((m) => `- ${m.move} Why: ${m.why}`),
].join("\n");

const CLIP = {
  type: "object", additionalProperties: false, required: ["start", "first_frame", "present", "motion"],
  properties: {
    start: { type: "string", enum: ["real_photo", "drawn"], description: "real_photo: animate the restaurant's own photo (the real dish). drawn: Muse Image draws the first frame from crops of the real ingredients." },
    first_frame: { type: "string", description: "For drawn: full image brief of the moment BEFORE the first action. For real_photo: what the real photo shows." },
    present: { type: "array", items: { type: "string" }, description: "Ingredient names (as in the dish card) already in the first frame. A build starts with only its first step." },
    motion: { type: "string", description: "Video prompt: each hard cut in order with its time, the real kitchen technique, hands and tools that cause every change, camera locked." },
  },
};

const CONCEPTS = {
  type: "object", additionalProperties: false, required: ["concepts"],
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "idea", "format", "cast", "new_format", "clips", "audio", "on_screen", "why_hungry", "realism_plan", "risk"],
        properties: {
          title: { type: "string" },
          idea: { type: "string", description: "The whole reel in two sentences." },
          format: { type: "string", description: "The flow in 3-6 words, e.g. 'pick, dunk, tear' or 'pour until it overflows'." },
          cast: { type: "string", description: "Who or what touches the food: a cook in gloves, the diner's bare hands, a fork, tongs, nobody (gravity, a pour)." },
          new_format: { type: "boolean", description: "true if it is not one of the reference formats." },
          clips: { type: "array", description: "3 generated clips of 4 s (a 12 s Reel). One clip may hold up to 5 hard cuts.", items: CLIP },
          audio: { type: "string" },
          on_screen: { type: "string", description: "On-screen line, under 9 words, or empty." },
          why_hungry: { type: "string" },
          realism_plan: { type: "string", description: "Why this will look like real footage from this kitchen: which proven moves it uses, where the real photo carries it." },
          risk: { type: "string", description: "What the video model may get wrong here." },
        },
      },
    },
  },
};

const IDEATE = `You are the creative director of the best food content studio in the world, and you only work for restaurants. You make a 12 second vertical Reel (three clips of 4 s) for a small independent restaurant from ONE real photo of their dish (attached).

THE DISH CARD (what it is and how this kitchen makes it, checked with the owner):
{CARD}

OUR TOOLS, AND WHAT THEY CAN REALLY DO:
- The real photo, which we can animate (start=real_photo) and use as the exact end frame.
- Crops of every real ingredient cut from that photo by SAM, so drawn kitchen frames use the restaurant's own bread, meat and sauces.
- An image-to-video model, 4 s per clip, up to 5 hard cuts per clip.
{PLAYBOOK}

FORMATS THAT WORK FOR FOOD (the floor, not the ceiling):
{RECIPES}

THE GOAL IS CRAVING WITHOUT SACRIFICING REALISM. The viewer must want to eat it now, and nothing may look generated.
Before you pitch, think like a director who knows his camera: what can we make look completely real with these tools? Spend boldness on the idea, the rhythm, the order and the payoff, not on effects the model cannot fake.
Craving comes from: food filling the frame, macro, gloss and oil shine, steam, sizzle, melting, sauces squeezed and dripping, generous portions, hands that press, lift, dip, tear, crisp against saucy, fast rhythm.

{HISTORY}

Every reference above moves differently. Find the ONE moment of THIS dish that makes people hungry (a crack, a pull, a dunk, a pour, a pile that overflows, a bite) and build the flow around it. Proven moves are tools, not a template: a cook in black gloves behind the dish is one option among many.
Write 8 concepts, as different from each other as possible in format AND cast, at least 3 of them formats not in that list.
Rules:
- Every kitchen shot is a real step from the dish card's assembly, done with this kitchen's technique. Ask yourself: would a line cook here do exactly this, in this order? If not, cut it.
- Only ingredients from the dish card. Same cut, same cheese, same bread.
- The real dish appears, ideally at the end, in a clip with start=real_photo.
- A drawn first frame shows the moment BEFORE the clip's first action and only the ingredients in "present".
- Kitchen clips open on food already cooking at its most appetizing: meat sizzling on the plancha, pieces bubbling golden in the fryer. Raw meat only when it is the iconic move of the dish (a burger ball smashed on the plancha): raw cuts look unappetizing and the model draws them as neat, fake cubes.
- The real-photo clip is the diner's moment, not a kitchen step: use what is already on the plate (squeeze the lime that is there, lift one piece to show the crunch, press, dip, tear). Never bring a second one into the shot.
- Every change inside a cut has a visible cause: a hand, a spatula, a squeeze bottle. Nothing appears from nowhere.
- Camera locked and close. A cook may be in the shot (gloved hands, forearms, a torso in a black t-shirt), never a face.
- Edit like a real video: whoever is in a shot is there from its first frame or walks in from the edge; nothing and nobody materializes. A new setup comes after a hard cut, like a real edit.
- No text inside the video, no logos, no props that take screen from the food.`;

export const loadHistory = (file = "data/history.json") => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
// The feed's memory, kept the way a person running many restaurants' accounts keeps it: a restaurant never repeats
// itself; another restaurant's idea from this week comes back only made this restaurant's own, and today's is the
// last to reuse; older ideas from other restaurants are free. Without a restaurant every reel counts as its own.
const WEEK = 7 * 864e5, home = (name) => name.split(" (")[0];
const historyText = (h, restaurant = "") => {
  const mine = (r) => !restaurant || home(r.restaurant) === home(restaurant), today = new Date().toISOString().slice(0, 10);
  const line = (r) => `- ${r.restaurant}, ${r.dish}${r.date === today ? " (today)" : ""}: "${r.title}". Format: ${r.format}. Cast: ${r.cast}.`;
  const own = h.filter(mine), recent = h.filter((r) => !mine(r) && Date.now() - Date.parse(r.date) < WEEK);
  return [
    own.length && `THIS RESTAURANT'S REELS. Never repeat their idea: the same structure and setup, even with another dish. A cast may come back in a new format:\n${own.map(line).join("\n")}`,
    recent.length && `OTHER RESTAURANTS' REELS FROM THIS WEEK. Their idea may come back only made this restaurant's own (its own dish, its own move, its place), never as a copy, and one made today is the last to reuse:\n${recent.map(line).join("\n")}`,
  ].filter(Boolean).join("\n\n");
};

export async function ideate(photo, card, recipes, playbook, history = []) {
  const lib = recipes.map((r) => `- ${r.format} (${r.dish.slice(0, 60)}): hook "${r.hook}". Works because ${r.why_it_works.slice(0, 180)}`).join("\n");
  const prompt = IDEATE.replace("{CARD}", JSON.stringify({ dish: card.dish, ingredients: card.ingredients, assembly: card.assembly }))
    .replace("{PLAYBOOK}", playbookText(playbook)).replace("{RECIPES}", lib).replace("{HISTORY}", historyText(history));
  return (await ask([{ type: "input_text", text: prompt }, await img(photo)], "concepts", CONCEPTS)).concepts;
}

const VERDICT = {
  type: "object", additionalProperties: false, required: ["scores", "winner", "fixes"],
  properties: {
    scores: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["index", "appetite", "scroll_stop", "realism", "kitchen_logic", "truth", "feasible", "note"],
        properties: {
          index: { type: "integer" },
          appetite: { type: "integer", description: "0-10: does it make you want to eat it now?" },
          scroll_stop: { type: "integer", description: "0-10: would a stranger stop scrolling in the first second?" },
          realism: { type: "integer", description: "0-10: will it look like real footage, not AI?" },
          kitchen_logic: { type: "integer", description: "0-10: would a line cook at this restaurant do exactly these steps in this order?" },
          truth: { type: "integer", description: "0-10: is the dish exactly the real dish?" },
          feasible: { type: "integer", description: "0-10: can our tools produce it cleanly, judging by the proven and failed moves?" },
          note: { type: "string" },
        },
      },
    },
    winner: { type: "integer" },
    fixes: { type: "array", items: { type: "string" }, description: "Concrete changes that make the winner better before it is shot." },
  },
};

export async function pick(photo, card, concepts, playbook, history = []) {
  return ask([
    { type: "input_text", text: `You are two judges in one: a tough Instagram food editor and the head chef of this restaurant. A studio pitched these Reel concepts for the dish in the photo.
Dish card: ${JSON.stringify({ dish: card.dish, ingredients: card.ingredients, assembly: card.assembly })}
${playbookText(playbook)}
${historyText(history)}
Proven moves are tools, not a template. A concept that repeats the format or the cast of a reel already made loses scroll_stop and appetite: the audience has seen it.
Score each concept honestly. Low scores for: a tutorial feel, a still dish with a slow camera, kitchen steps a cook would not do, anything that will look generated, anything not making you hungry.
The winner is the highest appetite (then scroll_stop) among concepts with realism >= 7, kitchen_logic >= 8, truth >= 8 and feasible >= 6.
Then list fixes that make the winner even stronger.
Concepts (index: JSON):
${concepts.map((c, i) => `${i}: ${JSON.stringify(c)}`).join("\n")}` },
    await img(photo),
  ], "verdict", VERDICT);
}

const FRAME_CHECK = {
  type: "object", additionalProperties: false, required: ["matches", "score", "problems", "fix_prompt"],
  properties: {
    matches: { type: "boolean" },
    score: { type: "integer", description: "0-10: how real and how true to the dish it is. When no attempt matches, the best score is used." },
    problems: { type: "array", items: { type: "string" } },
    fix_prompt: { type: "string", description: "If it does not match: the same image brief rewritten to fix the problems. Else empty." },
  },
};

// A drawn frame may show an earlier step, but every ingredient in it must be the real one and only
// the ones present at that moment. A mismatch costs a $0.01 redraw, not a $0.60 clip.
export async function checkFrame(photo, frame, card, brief, present) {
  return ask([
    { type: "input_text", text: `Image 1 is the restaurant's real dish. Image 2 is a drawn first frame for a video about it, from this brief: "${brief}".
Dish card: ${JSON.stringify(card.ingredients)}
Every ingredient in image 2 must match the real one: cut and size of pieces, kind of cheese, bread shape, sauces, nothing extra.
This is the START of the clip: only these may be visible: ${present.join(", ")}. Anything else from the dish already there is a mismatch.
It must also look like a real photo taken in a working restaurant kitchen, not a styled AI image.
Food that is still cooking looks different from the plated dish (wetter, lighter, in oil): that is fine. Fail only for a wrong ingredient, wrong cut or shape, wrong size, something extra or missing, or an obviously generated look. Small differences of color and light are fine.` },
    await img(photo), await img(frame),
  ], "frame_check", FRAME_CHECK);
}

const SCRIPT_WORDS = {
  type: "object", additionalProperties: false, required: ["layers", "shots"],
  properties: {
    layers: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "remove"], properties: {
      name: { type: "string" },
      remove: { type: "string", description: "Edit instruction for the image model: what to take off, then exactly how what lies underneath looks in this restaurant. For a step that wraps, covers or clears: what to put over the dish or take away, and how the result looks." },
    } } },
    shots: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "motion"], properties: {
      n: { type: "integer" },
      motion: { type: "string", description: "Video prompt: camera, the hand and tool that cause every change, what happens in order, what never changes." },
    } } },
  },
};

// Muse writes every word the image and video models get: how each hidden layer of the real dish looks
// and how each shot moves. It works from the real photo and the owner's facts only. A detail it cannot
// see and was not told stays out: an invented one ends up on screen (the yaroa's pierna came out with
// black charred bits from a line Muse never wrote).
export async function writeScript(photo, card, plan, playbook) {
  return ask([
    { type: "input_text", text: `Image 1 is a restaurant's real dish. You write the words for a Reel that builds it in a real kitchen.
Dish card, the owner's own facts: ${JSON.stringify(card)}
${playbookText(playbook)}

1. Layers. An image editor takes the real photo apart one step at a time; each step edits the frame named in "from" and becomes the start or end frame of a shot. For each step write one edit instruction: what to remove, then how what is underneath looks in THIS restaurant. A step that wraps or closes the dish (foil, paper, a lid, a closed box) says what to add over it and how it looks, real and plain. A step that clears the table for a trick says what to take away and that the table stays the same. Describe it from what you can see in the photo (edges and bits that peek out, color, cut, size) and from the owner's words. Never add what you cannot see and were not told: no char, black or burnt bits, no herbs, seasoning or garnish, no extra ingredient. Plain and true beats rich and invented.
Steps (name, from, what the frame shows): ${JSON.stringify(plan.layers)}

2. Shots. For each shot write the video prompt for an image-to-video model that starts on the frame named in "start" (it shows start_shows) and, when given, lands on the one named in "end" (it shows end_shows). Each prompt does exactly its own shot's "what", the change from start_shows to end_shows, with that shot's ingredient, sauce and tool; never an action that belongs to another shot. A handheld phone video in a real restaurant kitchen: say who does it (a hand in a black nitrile glove, a bare hand for a squeeze bottle), the tool, every action in order, and that the container and counter never move. The start frames show no hands, no tools and no people: hands and tools enter from the edge of the frame, and nobody stands behind the counter (a person who is not in the first frame pops in). Every change has a hand or tool causing it; nothing appears or disappears by itself. The food moves and looks like the card says. A trick shot is hands only: the gesture (a snap, a knock, a lens wipe, a lid about to lift) and no food appearing. A diner shot holds the food the way people hold it. End each prompt with: No faces, no text, no morphing.
Shots: ${JSON.stringify(plan.shots)}` },
    await img(photo),
  ], "script_words", SCRIPT_WORDS);
}

// The owner (or Muse's own review) looked at a frame and said what is wrong. Muse turns that into one edit
// of that same frame, so everything nobody mentioned stays as it was.
export async function fixFrame(photo, frame, card, note, who = "The owner") {
  return ask([
    { type: "input_text", text: `Image 1 is the restaurant's real dish. Image 2 is a frame of a Reel about it. ${who} looked at image 2 and said: "${note}"
Dish card: ${JSON.stringify(card)}
Write one instruction for an image editor that edits image 2 to fix exactly what the owner said, by naming what to change and how it must look instead. Everything else in image 2 stays the same.` },
    await img(photo), await img(frame),
  ], "frame_fix", { type: "object", additionalProperties: false, required: ["edit"], properties: { edit: { type: "string" } } });
}

const DRAFT_REVIEW = {
  type: "object", additionalProperties: false,
  required: ["approved", "craving", "realism", "physics_errors", "kitchen_errors", "truth_errors", "fixes"],
  properties: {
    approved: { type: "boolean" },
    craving: { type: "integer", description: "0-10: how much this makes you want to eat it right now." },
    realism: { type: "integer", description: "0-10: does it look like real footage?" },
    physics_errors: { type: "array", items: { type: "string" }, description: "Inside a cut: things or people that appear, vanish or change without a cause (a person materializing behind the food, a background that changes), morphing, broken hands. Name the second." },
    kitchen_errors: { type: "array", items: { type: "string" }, description: "Steps a cook here would not do, or not in this way." },
    truth_errors: { type: "array", items: { type: "string" }, description: "Food that differs from the dish card: wrong cut, extra ingredient, exaggerated amounts, skimpy portions." },
    fixes: { type: "array", items: { type: "string" }, description: "Concrete changes to the first frame or the motion prompt." },
  },
};

// Muse Spark watches a cheap draft before it is ever made at full quality.
// `start` is the clip's first frame: the background must stay what it was there.
export async function reviewDraft(photo, video, card, clip, playbook, start) {
  const f = await client.files.create({ file: fs.createReadStream(video), purpose: "user_data" });
  return ask([
    { type: "input_text", text: `Image 1 is the restaurant's real dish.${start ? " Image 2 is the first frame of the clip." : ""} The attached video is a low-resolution draft of one clip of a Reel about it (judge content, not sharpness).
Clip brief: ${JSON.stringify(clip)}
Dish card: ${JSON.stringify({ ingredients: card.ingredients, assembly: card.assembly })}
${playbookText(playbook)}
Watch it frame by frame. Hard cuts between moments are normal editing: judge continuity only inside each cut.
Kitchen clips are judged as the line cooks it. A clip that starts on the real dish is the diner's moment: judge it by whether someone eating it would do that (squeezing the lime that is on the plate is right; a second lime brought into the shot is wrong). Look at the grip, frame by frame: a hand holds each food the way people really hold it (a folded taco cradled from below or pinched across the fold so it stays closed, never lifted by one edge of the tortilla). A grip nobody uses is a kitchen error, and the clip is not approved.
Approve only if craving >= 7, realism >= 7, nothing appears or vanishes without a cause, every kitchen step is how this kitchen does it, and the food matches the dish card without exaggeration.
The food keeps the color, gloss and texture of the real dish in image 1 wherever it appears, also while it moves (in a basket, falling, in a hand): food paler, duller, puffier or smoother than the real dish reads as AI, so realism fails.
Judge the edit like a film editor: it must look like real footage cut by a real editor. A cook behind the food is fine if they are there from the first frame of the shot or walk in from the edge. Anything or anyone that fades or pops in, or a background that changes inside a shot, reads as a bad AI edit: fail.` },
    await img(photo),
    ...(start ? [await img(start)] : []),
    { type: "input_file", file_id: f.id },
  ], "draft_review", DRAFT_REVIEW);
}

const REVISION = {
  type: "object", additionalProperties: false, required: ["redraw_first_frame", "clip"],
  properties: { redraw_first_frame: { type: "boolean" }, clip: CLIP },
};

// After a rejected draft, Muse rewrites the shot itself: a new motion prompt, and a new first frame only if needed.
export async function reviseClip(card, clip, review, playbook) {
  return ask([{ type: "input_text", text: `A draft of this clip was rejected. Rewrite the clip so the next draft passes, keeping what worked.
Clip: ${JSON.stringify(clip)}
Review: ${JSON.stringify(review)}
Dish card: ${JSON.stringify({ ingredients: card.ingredients, assembly: card.assembly })}
${playbookText(playbook)}
Prefer simpler, more physical actions with a visible cause over clever ones. Set redraw_first_frame only if the problem is in the first frame.
The clip lasts exactly 4 s: every time mark stays between 0 and 4.0 s, at most 5 hard cuts. Keep the motion prompt under 80 words: a long prompt makes the video model drop half of it.` }], "revision", REVISION);
}

const LESSON = (fields) => ({ type: "object", additionalProperties: false, required: fields, properties: Object.fromEntries(fields.map((k) => [k, { type: "string" }])) });
const LESSONS = {
  type: "object", additionalProperties: false, required: ["taste", "proven", "failed", "retract", "summary"],
  properties: {
    taste: { type: "array", items: { type: "string" }, description: "New general rules of taste. Empty if the playbook already says it." },
    proven: { type: "array", items: LESSON(["move", "evidence"]) },
    failed: { type: "array", items: LESSON(["move", "why"]) },
    retract: { type: "array", items: { type: "string" }, description: "Exact text of playbook taste rules or moves the owner just contradicted." },
    summary: { type: "string", description: "One or two short sentences to the owner, in their language: what Domi learned and will do differently." },
  },
};

// The owner's verdict, in their own words, becomes lessons that every later Reel reads.
export async function learn(playbook, verdict, run) {
  return ask([{ type: "input_text", text: `The restaurant owner watched a Reel draft that you directed and said, in their own words: "${verdict}"
The draft: ${JSON.stringify(run)}
Current playbook:
${playbookText(playbook)}
Turn the verdict into lessons for every future Reel, of any dish:
- What the owner liked becomes a proven move, specific enough to repeat, with the owner's words as evidence.
- Every problem the owner saw becomes a failed move whose "why" says what went wrong and what to do instead. Look for the cause in the clip briefs and motion prompts.
- A taste rule only if it is new and general.
- If the owner corrects a lesson already in the playbook, put its exact text in retract and write the corrected one.
Never repeat what the playbook already says. Entries in English; the summary in the owner's language.` }], "lessons", LESSONS);
}

export function addLessons(playbook, lessons, file = "data/playbook.json") {
  // Muse quotes a retracted entry as the playbook prints it, sometimes with its "Why:" attached.
  const gone = (text) => lessons.retract.some((r) => r.includes(text));
  playbook.taste = playbook.taste.filter((t) => !gone(t));
  playbook.proven = playbook.proven.filter((m) => !gone(m.move));
  playbook.failed = playbook.failed.filter((m) => !gone(m.move));
  playbook.taste.push(...lessons.taste);
  playbook.proven.push(...lessons.proven);
  playbook.failed.push(...lessons.failed);
  fs.writeFileSync(file, JSON.stringify(playbook, null, 2) + "\n");
}

// Menu-level pitch: Muse sees every dish photo of the restaurant (numbered contact sheets) and decides what the
// next Reel is about, one dish or many. It reads the craft (data/craft.md) as the director who made the good Reels by
// hand, and starts from what its photos can really do (src/inventory.mjs), inside the kinds of Reel this restaurant
// drew this week (src/week.mjs). The owner's 43 reference Reels are the catalog of kinds (data/families.json).
const FAMILIES = JSON.parse(fs.readFileSync(new URL("../data/families.json", import.meta.url), "utf8"));
export const loadCraft = () => fs.readFileSync(new URL("../data/craft.md", import.meta.url), "utf8");
const tasteText = (p) => ["Taste:", ...p.taste.map((t) => `- ${t}`), "Moves that failed:", ...p.failed.map((m) => `- ${m.move} Why: ${m.why}`)].join("\n");

const PITCH_MENU = `You are the creative director of Domi, a studio that makes Instagram and TikTok Reels for small independent restaurants out of the photos they already have. This is how we make them, learned Reel by Reel with a restaurant owner. Read it as the director who made the good ones:

{CRAFT}

RESTAURANT: {R}
ITS MENU (number: name, description, price):
{MENU}
The attached contact sheets show every dish photo with its menu number.

WHAT YOU HAVE TO WORK WITH. You looked at every good photo full size and wrote what it can really do, and how people really eat it:
{INVENTORY}
{OWN}
Equipment footage only this restaurant may use: {STOCK}

{TRENDS}

You invent this week's Reel ideas yourself. There is no list of kinds to pick from. Every idea has a style (how it is filmed), a moment, its dishes and a hook:
{AXES}

STYLES TAKEN THIS WEEK by other restaurants: {TAKEN}. Leave those to them.
THIS RESTAURANT'S LAST REELS were filmed as: {MINE}. Not those again.

Ideas that worked for us before, to learn from, never to copy as a template:
{EXAMPLES}

{HISTORY}

THE OWNER'S CORRECTIONS SO FAR (details the craft above already sums up):
{TASTE}

Write {N} Reel ideas, as different from each other as possible: at least 4 different styles, the best idea you can think of in each, at least one with several dishes or the menu, and different dishes where the menu allows. Start every idea from two questions: what is people's attention on this week, and what is possible with what this restaurant has? A format that is working now, a day ahead, a line people type: take it and make it this restaurant's own. Choose dishes whose photos and inventory carry the idea, and name the tool that makes every shot. An idea that leans on what our camera does badly is not an idea for us, however good it sounds. The owner's bar: "no es copiar nada más, es tener la creatividad de crear cosas así que nadie nunca haya hecho".
Rules:
- Only dishes from this menu, exactly as their photos and the owner show them. Never invent a dish, an ingredient, a price or an offer. A price on screen is the menu's price.
- 9-13 s with a story, ending on the real dish.
- Every hand does what people really do with that dish: its inventory says what it is eaten with. A sandwich, a taco, an empanada are held in the hand, never lifted with a fork.
- Nobody eats, walks or talks on camera. A person on screen is only this restaurant's house cast, in an idea told by an avatar, holding or showing the real dish, the box or the bag, or reacting almost still.
- Never invent the place: the counter, the kitchen or the storefront come only from this restaurant's own photos or its equipment footage.
- Everything happens at the restaurant: its table, its counter, its kitchen. A moment of the week (rain, a game, a holiday) lives in the words and the hook ("raining? we bring it to you", "game day order"), never by moving the food to a living room, a rainy window or a car (Yansel, 4 Nov: "prefiero contenido que siempre parezca que está en el restaurante").
- Title, idea, shots and sound in Spanish for the owner, in plain words. The on-screen text in {LANG}, like a creator typing in the app. Dish names as on the menu.`;

const TOOLS = ["peel and rebuild", "hands on the real dish", "equipment", "edit trick", "real photo flash", "wrapped", "place", "text over the real photo", "house cast holds it", "owner's voice"];
const MENU_CONCEPTS = {
  type: "object", additionalProperties: false, required: ["concepts"],
  properties: {
    concepts: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["title", "kind", "axes", "starts_from", "format", "fresh", "cast", "own", "dishes", "idea", "hook", "hook_text", "rhythm", "shots", "sound", "why_real", "risk"],
        properties: {
          title: { type: "string" },
          kind: { type: "string", description: "Your own short name for this kind of Reel, in Spanish, 2-5 words." },
          axes: { type: "object", additionalProperties: false, required: ["style", "new_style", "moment", "dishes", "hook"], properties: {
            style: { type: "string", enum: [...Object.keys(STYLES), "new"] },
            new_style: { type: "string", description: "Only for style \"new\": its name and how our camera makes it, in English. Empty otherwise." },
            moment: { type: "string", enum: Object.keys(AXES.moment) },
            dishes: { type: "string", enum: Object.keys(AXES.dishes) }, hook: { type: "string", enum: Object.keys(AXES.hook) },
          } },
          starts_from: { type: "string", description: "In English: the format, day or line of this week it starts from, or the example that worked; \"own\" if it comes from nothing above." },
          format: { type: "string", description: "The structure the viewer sees, in one English line (e.g. 'empty pan built sauce by sauce, then a fork lifts a bite')." },
          fresh: { type: "string", description: "In one English line, what makes it new for this restaurant and not a copy of the Reel it learned from." },
          cast: { type: "string", description: "What acts on screen, in English: gloved hands, a bare hand, a fork, tongs, a squeeze bottle, nobody." },
          own: { type: "string", description: "What makes it only this restaurant's, in English." },
          dishes: { type: "array", items: { type: "integer" }, description: "Menu numbers of the dishes in the Reel; the first is the hero, the one the Reel lives on." },
          idea: { type: "string", description: "The whole Reel in two sentences." },
          hook: { type: "string", description: "What stops the scroll in the first second." },
          hook_text: { type: "string", description: "The on-screen line of the first second, like a creator types it; empty only if the Reel has no text." },
          rhythm: { type: "string", enum: ["fast cut", "long takes"] },
          shots: { type: "array", items: { type: "object", additionalProperties: false, required: ["what", "tool", "dish", "seconds"], properties: {
            what: { type: "string" },
            tool: { type: "string", enum: TOOLS },
            dish: { type: "integer", description: "Menu number of the dish in the shot, 0 for none." },
            seconds: { type: "number" } } } },
          sound: { type: "string", description: "The music's mood and the kitchen sounds that matter." },
          why_real: { type: "string", description: "In English: for each shot, the inventory fact that makes it possible." },
          risk: { type: "string", description: "In English: the shot our camera is most likely to miss, and what the Reel does without it." },
        },
      },
    },
  },
};

// The restaurant's own place and its equipment, as the pitch and the plan read them.
const ownText = (own) => own.length ? `This restaurant's own photos of its place and equipment, always before footage: ${own.map((o) => o.what).join("; ")}.`
  : "This restaurant has sent no photos of its place or equipment yet.";
// The week's ideas, invented by Muse (src/ideas.mjs): from this week's trends, what this restaurant has, the combos
// other restaurants took and this restaurant's own last ones.
// focus: an extra brief for this pitch only (Yansel, 4 Nov: "uno que contenga un producto y uno que contenga varios").
export async function pitchMenu(sheets, restaurant, menu, playbook, history = [], { own = [], inv = [], stock = [], lang = "English", trends = "", axes = "", taken = [], mine = [], examples = "", n = 6, focus = "" } = {}) {
  const prompt = PITCH_MENU.replace("{CRAFT}", loadCraft()).replace("{R}", restaurant).replace("{TASTE}", tasteText(playbook)).replace("{HISTORY}", historyText(history, restaurant))
    .replace("{INVENTORY}", inventoryLines(inv)).replace("{OWN}", ownText(own))
    .replace("{STOCK}", stock.length ? stock.map((s) => `${s.name} (${s.what})`).join("; ") : "none")
    .replace("{TRENDS}", trends).replace("{AXES}", axes).replace("{EXAMPLES}", examples)
    .replace("{TAKEN}", taken.length ? taken.join("; ") : "none yet").replace("{MINE}", mine.length ? mine.join("; ") : "none yet")
    .replace("{N}", String(n)).replace("{LANG}", lang)
    .replace("{MENU}", menu.map((m) => `${m.id}: ${m.name}${m.description ? `, ${m.description}` : ""}, $${m.price}${m.photo_score != null ? ` [photo ${m.photo_score}/10]` : ""}`).join("\n"))
    + (focus ? `\n\nTHIS TIME: ${focus}` : "");
  return (await ask([{ type: "input_text", text: prompt }, ...(await Promise.all(sheets.map(img)))], "menu_concepts", MENU_CONCEPTS)).concepts;
}
// The inventory, one line per dish (same as src/inventory.mjs inventoryText; kept here so the director has no cycle).
const inventoryLines = (inv) => inv.map((d) => [
  `${d.id}: ${d.name} [photo ${d.score}/10]`,
  d.eaten_with && `eaten with ${d.eaten_with}: ${d.held}`,
  d.layers.length ? `layers top-down: ${d.layers.join(" > ")}` : d.closed ? "closed: cannot be peeled" : "not layered",
  `hands: ${d.hands.join("; ")}`, d.wrap && `can start ${d.wrap}`, d.station !== "none" && `cooked: ${d.station}`,
  d.melt && "cheese stretches", d.liquid && `to dip or pour: ${d.liquid}`, `${d.pieces} piece${d.pieces === 1 ? "" : "s"}`,
  `hungriest: ${d.hungriest}`, d.weak.length && `weak: ${d.weak.join("; ")}`,
].filter(Boolean).join(" | ")).join("\n") || "not looked at yet";

// What has come out so far, measured on every draft Muse reviewed in every run: Muse weighs what works (Yansel, 2 Nov).
// On 2 Nov a shot where the video makes or assembles the food had passed 2 of 38 times, a hand on the real dish 23 of 76;
// both Reels of that day's second batch leaned on making food and neither came out.
const KIND_WORDS = { build: "a build from one layer of the real photo to the next", diner: "a hand acts on the real finished dish (lifts, dips, breaks, pulls it)", trick: "hands only, a gesture before a cut", guest: "a house cast member holds the real dish" };
export function trackRecord(root = "lab/out/auto") {
  const st = {};
  for (const d of fs.existsSync(root) ? fs.readdirSync(root) : []) {
    if (!fs.existsSync(`${root}/${d}/plan.json`)) continue;
    const kinds = Object.fromEntries((JSON.parse(fs.readFileSync(`${root}/${d}/plan.json`, "utf8")).shots || []).map((x) => [x.n, x.kind]));
    // A take counts as passed when Muse approved it whole (before 3 Nov) or found its key action in the dailies.
    for (const f of fs.readdirSync(`${root}/${d}`).filter((f) => /^draft-\d+-\d+\.(review|dailies)\.json$/.test(f))) {
      const k = kinds[f.split("-")[1]];
      if (!KIND_WORDS[k]) continue;
      (st[k] ||= { tries: 0, ok: 0 }).tries++;
      const r = JSON.parse(fs.readFileSync(`${root}/${d}/${f}`, "utf8"));
      if (r.approved || r.covered) st[k].ok++;
    }
  }
  return st;
}
export const trackText = (st = trackRecord()) => {
  const rows = Object.entries(st).map(([k, v]) => `${KIND_WORDS[k]}: ${v.ok} of ${v.tries} drafts passed (${Math.round((100 * v.ok) / v.tries)}%)`);
  return rows.length ? `What has come out so far, measured on every video draft reviewed: ${rows.join("; ")}. An idea that leans on the shots that rarely pass burns its budget and does not come out.` : "";
};

const MENU_VERDICT = {
  type: "object", additionalProperties: false, required: ["scores"],
  properties: {
    scores: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["index", "appetite", "scroll_stop", "realism", "originality", "photos", "repeats", "note"],
      properties: {
        index: { type: "integer" },
        appetite: { type: "integer", description: "0-10: does it make you want to eat now?" },
        scroll_stop: { type: "integer", description: "0-10: would a stranger stop in the first second?" },
        realism: { type: "integer", description: "0-10: will it look like real footage and come out, judging by the toolbox, the failed moves and what has come out so far?" },
        originality: { type: "integer", description: "0-10: is it a fresh take made for this restaurant, not a copy of a studied Reel or a template any restaurant could get?" },
        photos: { type: "integer", description: "0-10: are the chosen dish photos good enough to carry it?" },
        repeats: { type: "string", description: "The title of one of THIS RESTAURANT'S own Reels already made whose idea this concept repeats; empty if none. Never another restaurant's Reel, never another concept of this pitch." },
        note: { type: "string", description: "One line in Spanish for the owner." },
      } } },
  },
};

export async function judgeMenu(sheets, concepts, playbook, history = [], restaurant = "", inv = []) {
  return (await ask([
    { type: "input_text", text: `You are two judges in one: a tough Instagram food editor and the owner of this restaurant. A studio pitched these Reel concepts from the menu in the contact sheets (photo numbers are menu numbers). This is how the studio makes Reels and what the owner said about the ones already made:
${loadCraft()}

What each dish photo can really do:
${inventoryLines(inv)}

${tasteText(playbook)}
${historyText(history, restaurant)}
${trackText()}
Score every concept honestly. Realism is whether every shot will come out with our camera, judged shot by shot against the craft and the inventory: a shot that needs the video model to make food appear, a person eating, walking or talking, or a liquid from nothing will not. A hand doing what nobody does with that dish (a fork lifting a sandwich, a spoon on a taco: the inventory says what each dish is eaten with) is realism 2 at most: the owner sees it at once. The table pass of several dishes (a spread) is made in the edit by moving over the restaurant's real photos set on one table, with no video model: it always comes out, so judge only the dish shots after it. Judge every idea against what its own style's tools do, never against another style: the restaurant's food on a real equipment frame (making), the camera passing over the real photos in the edit (table), text over the real photos (letters) are as real as a hand on the dish when done that way. Several dishes come out as well as one (Yansel, 4 Nov: "hay muchas maneras de hacerlo"): each dish gets its own shot from its own real photo with its own motion (a hand lifts, dips or breaks that dish), or the camera moves over the real dishes while the food stays still. Judge each of those shots like a one-dish shot; a Reel of several dishes is photos passing by only when nothing happens in its shots. An idea told in letters over the real photos has no AI video and always comes out, but it is a Reel only if the text tells a story the viewer wants to finish; photos passing by with labels score low on scroll stop. Low scores for a dish just sitting there, photos passing by, an ad more than a Reel, anything under 9 s, steps a cook would not do, photos too weak to carry it.
Repeats: compare each concept's structure with THIS RESTAURANT'S own Reels above, beat by beat: the same structure is a repeat even with another of its dishes and another name. Other restaurants' Reels are not repeats: each restaurant gets a different style this week, and an idea may come back made a restaurant's own (Yansel, 4 Nov). Sharing only a cast (gloved hands, bare hands, a fork) is not a repeat. Never compare concepts of this pitch with each other.
Concepts (index: JSON):
${concepts.map((c, i) => `${i}: ${JSON.stringify(c)}`).join("\n")}` },
    ...(await Promise.all(sheets.map(img))),
  ], "menu_verdict", MENU_VERDICT)).scores;
}

// Muse chooses which Reel this restaurant makes this week, among its best idea in each style it can make: the style
// is not drawn by lot nor won by the safest score (src/ideas.mjs). lab/friday.mjs then keeps restaurants apart.
const CHOICE = {
  type: "object", additionalProperties: false, required: ["order", "why"],
  properties: {
    order: { type: "array", items: { type: "integer" }, description: "Every candidate's index, the one you would make this week first." },
    why: { type: "string", description: "One line in Spanish for the owner: why the first one, this week." },
  },
};
export async function chooseWeek(restaurant, candidates, trends = "", history = []) {
  return ask([{ type: "input_text", text: `You are the creative director of ${restaurant}'s Instagram. This week it gets one Reel. These are your best ideas, one per style (how it is filmed). Choose the one you would make this week: what people's attention is on now, what this restaurant has not shown lately, what will make someone stop and want to eat it. Then the rest, in order.
${trends}
${historyText(history, restaurant)}
Candidates (index: JSON):
${candidates.map((c, i) => `${i}: ${JSON.stringify({ style: c.axes?.style, title: c.title, idea: c.idea, hook_text: c.hook_text, starts_from: c.starts_from, judge: c.muse?.note })}`).join("\n")}` }], "week_choice", CHOICE);
}

// ---- The whole Reel, planned and cut by Muse, so no person has to write a script or pick a frame. ----

const PLAN_SHOT = {
  type: "object", additionalProperties: false, required: ["n", "kind", "start", "end", "focus", "dish", "stock", "what"],
  properties: {
    n: { type: "integer" },
    kind: { type: "string", enum: ["build", "diner", "trick", "still", "stock", "spread"] },
    start: { type: "string", description: "build and trick: the layer it starts on. diner: \"real\", or the equipment layer the dish sits on while it cooks. still and stock: empty." },
    end: { type: "string", description: "build: the next layer up, or \"real\" for the last step or an unwrap; empty only if that step cannot be a still frame. Others: empty." },
    focus: { type: "string", description: "diner and still: 1-4 plain English words a segmentation model can find, to frame the shot tight (\"sauce lines\", \"crackling skin\"); empty for the whole dish." },
    dish: { type: "integer", description: "The menu number of the dish the shot is about when it is not the hero; 0 for the hero. A build on another dish uses that dish's layers, and its \"real\" is that dish's photo." },
    stock: { type: "string", description: "stock: the clip name from the list. Others: empty." },
    what: { type: "string", description: "What happens, in one line: an action that finishes where the camera sees it (breaks open, lifts to the lens, drips, stretches, pours). Never a touch, a hover or a lift \"a little\"." },
  },
};
const PLAN_REEL = {
  type: "object", additionalProperties: false, required: ["container", "surface", "layers", "shots", "rhythm", "music_register", "music", "text_style", "texts", "owner_summary"],
  properties: {
    container: { type: "string", description: "What holds the hero dish, in 1-3 plain English words a segmentation model finds: \"foil pan\", \"white plate\", \"black takeout tray\"." },
    surface: { type: "string", description: "Empty to keep the photo's own table. Otherwise one edit instruction that puts the dish in the idea's place or on a restaurant table." },
    layers: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "dish", "from", "shows", "present"], properties: {
      name: { type: "string", description: "One short lowercase word." },
      dish: { type: "integer", description: "0 for the hero. The menu number of another dish of the idea when this layer is made from that dish's own photo (\"real\" then means that dish's photo)." },
      from: { type: "string", description: "\"real\" or the name of an earlier layer of the same dish." },
      shows: { type: "string", description: "What this frame shows." },
      present: { type: "array", items: { type: "string" }, description: "Dish card ingredient names visible in this frame." },
    } } },
    shots: { type: "array", items: PLAN_SHOT, description: "In story order." },
    rhythm: { type: "string", enum: ["fast cut", "long takes"] },
    music_register: { type: "string", description: "One register from the list given." },
    music: { type: "string", description: "Prompt for an instrumental music model; empty when the register is no music." },
    text_style: { type: "string", description: "One text style from the list given." },
    texts: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "shot"], properties: {
      text: { type: "string" },
      shot: { type: "integer", description: "0 for the hook in the first second; else the shot it sits on." },
    } } },
    owner_summary: { type: "string", description: "The Reel in 3-5 short lines, in Spanish, for the owner." },
  },
};

const PLAN_PROMPT = `You direct a Reel for a small independent restaurant. A machine makes it with no human help, so the plan must be exact. This is how we make Reels:

{CRAFT}

The idea the judge chose: {CONCEPT}
Image 1 is the restaurant's real photo of the hero dish, {DISH} (menu {HERO}). {OTHERS}
What the photos can really do:
{INV}
Hero dish card (the owner's facts): {CARD}
Equipment footage this restaurant may use (nobody else's): {STOCK}

HOW THE MACHINE MAKES EACH SHOT
- Layers: the image editor makes every frame a video shot starts or ends on, from the real photo. Each layer edits the frame named in "from". To peel: take off what was added last (the top sauce first), then the next, down to the empty container (the first layer is "from": "real"). Only what the camera sees from outside comes off: closed food cannot be opened. To wrap or close: a layer from "real" that adds the foil, the paper, the lid or the box over the dish. For a trick: a layer from "real" with the food (and the container if the idea wants) gone, the table left.
- Equipment frames: a layer may start from real equipment footage instead of the photo: "from": "stock:<clip name>" takes a frame of that clip (only clips marked [can hold the dish]) and its instruction puts this restaurant's own food on it, the way it sits there while it cooks (the quesadilla triangles on the plancha, the chunks in the fryer basket). Then build and diner shots start from that frame, and the edit cuts from it to the plated real dish. This is how the chicharrón came out of a real fryer.
- build: a 4 s video from one layer to the next one up ("fries" to "meat"), or from a wrapped layer to "real" (hands unwrap). A hand or a tool adds exactly that step. The last build shot of a build ends on "real". Another dish of the idea can have its own layers (set the layer's dish): its "real" is its own photo, and a build on it sets the shot's dish.
- diner: a 4 s video from the real dish ("start": "real"), or from an equipment layer where the dish sits while it cooks ("start": "plancha"), framed tight on "focus" if given: a hand, a fork or a spatula acts on what is already there. A shot that happens on the equipment must start on that layer: a shot that starts on the plated photo stays on the plate. "dish" may name another dish of the idea: the shot then starts from that dish's own photo.
- trick: a 4 s video from a layer (the empty table, the closed box) where only hands move: a snap, a knock, a lens wipe, a lid about to lift. No food appears in it: the edit cuts from it to the food.
- spread: one frame where every dish of the idea sits together on one table, each cut out of its own real photo, and the edit moves the camera down the table across them like a documentary (1.2-2.2 s); the food never moves. Only for an idea with several dishes, at most one; it is not a video shot. Each dish gets its own shots after it.
- still: the real photo of a dish as a 0.4-0.6 s flash, tight on "focus" if given.
- stock: equipment footage from the list above, only when it is how this dish is really cooked.
{SHOTRULE}

THE MUSIC: the register that fits this food and this idea, from these (no other restaurant has them this week): {MUSIC}. Then the prompt for an instrumental music model: genre, instruments, tempo, mood, how it moves under this Reel. It must carry on a phone speaker, which plays no bass: a melody, a lead or bright percussion on top, never only drums and sub bass (Pikalo's Brazilian funk was all bass and the owner heard no music). Not "full energy to one big final hit" by default: a Reel's music is a bed, not a jingle. If you pick no music, the prompt is empty.
THE TEXT: up to 3 lines typed on screen the way a creator types them in the app, in {LANG} (the language of the Reel's audience, even though the owner_summary is in Spanish): the hook in the first second (shot 0) and at most two more, each on the shot it belongs to. One style for the whole Reel, from: {TEXT}. Only true facts: the dish, what is in it, the city. Nothing about prices or offers. No text at all is fine when the food says it.

THE OWNER'S LESSONS, SHOT BY SHOT:
{PLAYBOOK}

RULES
- Keep the idea, its dishes and its rhythm ({RHYTHM}). Where it asks for what the machine cannot do, keep the idea and change the shot.
- The Reel ends on its payoff: a diner shot, or the build that lands on "real" when the reveal is the payoff.
- Every kitchen step is how a line cook here does it, in this order. Only ingredients on the card, as the owner described them.
- Nobody stands behind the dish: hands and tools enter from the edge.
- The surface: when the idea happens in a place, one instruction that puts the dish there, and every shot of the hero starts in that place. Otherwise keep the photo's own table unless it looks like a home (a tablecloth, clutter); then a restaurant table or counter.
- Never fall back on the structure of a Reel already made:
{HISTORY}
- Layer names are short lowercase words (nosauce, meat, fries, empty, wrapped). Shot n counts from 1 in story order.`;

// Muse turns the chosen concept into a plan the machine can run: the layers of the real photo, every shot, the
// surface, the music and the text. Broken references go back to Muse once, with what is wrong.
// failed: layers Muse Image could not draw on an earlier try ({name, remove, problems}); the new plan goes around them.
// look: { inv, music, text, lang }: the inventory, this week's music registers and text styles, the Reel's language.
// The style decides how many video shots, stills and lines a Reel has (src/ideas.mjs, STYLES): a Reel told in letters
// was planned as 6-9 hand shots like every other until 4 Nov, so every idea came out as the same Reel.
const styleOf = (concept) => (STYLES[concept.axes?.style] ? concept.axes.style : "close");
const SHOTS = { close: [5, 9, 2, 3], making: [4, 8, 2, 3], table: [3, 7, 2, 3], letters: [1, 4, 6, 5], place: [3, 7, 2, 3], avatar: [4, 8, 2, 3] };
const shotRule = (style, seconds) => {
  const [lo, hi, stills, texts] = SHOTS[style];
  return `Every video shot lasts 4 s and the editor keeps only its good seconds. This Reel is filmed ${STYLES[style].es} (${style}): ${STYLES[style].en} How we make it: ${STYLES[style].plan} So plan ${lo} to ${hi} video shots (build, diner, trick) for a ${seconds} s Reel, at most ${stills} stills${style === "letters" ? " (each 0.5-1.2 s, the edit pushes in on the real photo)" : ""}, at most 1 stock shot${style === "place" ? " besides the restaurant's own place photos (as stock shots of its own photos, 2 to 4 of them)" : ""}${style === "table" ? ", and exactly one spread shot" : ""}${style === "making" ? "; at least one layer starts from an equipment frame (\"from\": \"stock:<name>\") with this restaurant's own food on it" : ""}, and up to ${texts} text lines.`;
};
export async function planReel(photo, hero, others, card, concept, playbook, stock, failed = [], restaurant = "", seconds = 11, look = {}) {
  const { inv = [], music = [], text = [], lang = "English" } = look;
  const shown = new Set([hero, ...others.map((o) => o.id)]);
  const content = [
    { type: "input_text", text: PLAN_PROMPT.replace("{SHOTRULE}", shotRule(styleOf(concept), seconds)).replace("{CRAFT}", loadCraft()).replaceAll("{SECONDS}", seconds).replaceAll("{MINSHOTS}", 6).replace("{CONCEPT}", JSON.stringify(concept))
      .replace("{DISH}", card.dish).replace("{HERO}", hero).replace("{RHYTHM}", concept.rhythm || "the idea's")
      .replace("{OTHERS}", [
        others.filter((o) => !o.extra).length ? `Images ${others.map((o, i) => ({ o, i })).filter(({ o }) => !o.extra).map(({ o, i }) => `${i + 2} (menu ${o.id}, ${o.name})`).join(", ")} are the other dishes in the idea.` : "",
        // Yansel, 2 Nov: "muse debe ser capaz de escoger otros platos tambien si ve que no va a llegar".
        others.some((o) => o.extra) ? `Images ${others.map((o, i) => ({ o, i })).filter(({ o }) => o.extra).map(({ o, i }) => `${i + 2} (menu ${o.id}, ${o.name})`).join(", ")} are other dishes of this menu with good photos: bring one in only as a beat that fits the story.` : "",
        "A diner shot or a still may start on any of these images: set its dish to that menu number.",
        // The owner's own way with several dishes (4 Nov), a preference and not a template.
        others.some((o) => !o.extra) ? "The owner likes a Reel of several dishes to open on all of them together on one table, the camera passing over them like a documentary (one spread shot), and then each dish with its own action. Do it that way unless this idea is told better another way." : ""].filter(Boolean).join(" "))
      .replace("{INV}", inventoryLines(inv.filter((d) => shown.has(d.id)))).replace("{CARD}", JSON.stringify(card)).replace("{PLAYBOOK}", playbookText(playbook))
      .replace("{HISTORY}", historyText(loadHistory(), restaurant) || "none yet.")
      .replace("{STOCK}", stock.length ? stock.map((s) => `${s.name} (${s.what})${s.base ? " [can hold the dish]" : ""}${s.used ? " [already in this restaurant's recent Reels: pick another]" : ""}`).join("; ") : "none")
      .replace("{MUSIC}", (music.length ? music : ["any that fits"]).join("; ")).replace("{TEXT}", (text.length ? text : ["classic", "none"]).join(", ")).replace("{LANG}", lang)
      + (failed.length ? `\nLast time the image editor could not draw these layers, so plan around them and never ask for them again: ${JSON.stringify(failed)}` : "")
      + (look.heroOffSite ? `\nThe hero's photo was taken at a ${look.heroOffSite}, not at the restaurant: "surface" must move the dish onto a plain, warm restaurant table or counter, and every shot of it starts there. Nothing of the ${look.heroOffSite} may show.` : "") },
    await img(photo), ...(await Promise.all(others.map((o) => img(o.photo)))),
  ];
  let plan = await ask(content, "reel_plan", PLAN_REEL);
  // An idea set in an occasion or a place puts the dish there (week files before 4 Nov said it with the kind's shape).
  const place = ["occasion", "place"].includes(concept.axes?.moment) || FAMILIES.find((x) => x.es_name === concept.kind)?.shape === "una escena";
  const wrong = planErrors(plan, hero, others, stock, { place: place || !!look.heroOffSite, music, text, style: styleOf(concept) });
  if (wrong.length) plan = await ask([...content, { type: "input_text", text: `Your last plan had these errors; fix them and return the whole plan: ${JSON.stringify(plan)}\nErrors: ${wrong.join("; ")}` }], "reel_plan", PLAN_REEL);
  return plan;
}

export function planErrors(plan, hero, others, stock, { place = false, music = [], text = [], style = "close" } = {}) {
  const names = new Set(["real"]), errs = [], dishOfLayer = {};
  if (place && !plan.surface) errs.push("the idea happens in a place, so surface must put the dish there");
  for (const l of plan.layers) {
    const d = l.dish && l.dish !== hero ? l.dish : 0;
    if (d && !others.some((o) => o.id === d)) errs.push(`layer ${l.name} is made from menu ${d}, not one of the images`);
    if (l.from.startsWith("stock:") && !stock.some((x) => x.base && `stock:${x.name}` === l.from)) errs.push(`layer ${l.name} starts from "${l.from}", not a clip that can hold the dish`);
    else if (l.from.startsWith("stock:")) { names.add(l.name); dishOfLayer[l.name] = d; continue; }
    if (l.from !== "real" && !names.has(l.from)) errs.push(`layer ${l.name} edits "${l.from}", which comes later or does not exist`);
    else if (l.from !== "real" && dishOfLayer[l.from] !== d) errs.push(`layer ${l.name} edits "${l.from}", a layer of another dish`);
    names.add(l.name);
    dishOfLayer[l.name] = d;
  }
  for (const s of plan.shots) if (s.kind === "build") {
    const d = s.dish && s.dish !== hero ? s.dish : 0;
    for (const k of [s.start, s.end]) if (k && k !== "real" && dishOfLayer[k] !== undefined && dishOfLayer[k] !== d) errs.push(`build shot ${s.n} uses layer "${k}" of another dish: set the shot's dish to the layer's dish`);
  }
  for (const s of plan.shots) {
    if ((s.kind === "build" || s.kind === "trick") && !names.has(s.start)) errs.push(`shot ${s.n} starts on "${s.start}", not a layer`);
    if (s.kind === "build" && s.end && !names.has(s.end)) errs.push(`shot ${s.n} ends on "${s.end}", not a layer`);
    if (s.kind === "diner" && s.start !== "real" && !names.has(s.start)) errs.push(`diner shot ${s.n} must start on "real" or a layer`);
    if ((s.kind === "diner" || s.kind === "still") && s.dish && s.dish !== hero && !others.some((o) => o.id === s.dish)) errs.push(`shot ${s.n} shows menu ${s.dish}, not one of the images`);
    if (s.kind === "stock" && !stock.some((x) => x.name === s.stock)) errs.push(`stock shot ${s.n} uses "${s.stock}", not in the list`);
  }
  if (plan.shots.filter((s) => s.kind === "spread").length > 1) errs.push("more than 1 spread shot");
  if (plan.shots.some((s) => s.kind === "spread") && !others.length) errs.push("a spread shot needs the idea's other dishes");
  const ai = plan.shots.filter((s) => ["build", "diner", "trick"].includes(s.kind)).length, [lo, hi, stills, texts] = SHOTS[style] || SHOTS.close;
  if (ai < lo || ai > hi) errs.push(`${ai} video shots; this style needs ${lo} to ${hi}`);
  if (plan.shots.filter((s) => s.kind === "still").length > stills) errs.push(`more than ${stills} stills`);
  if (style === "table" && plan.shots.filter((s) => s.kind === "spread").length !== 1) errs.push("a table Reel has exactly one spread shot");
  if (style === "making" && !plan.layers.some((l) => l.from.startsWith("stock:"))) errs.push("a making Reel puts this restaurant's food on an equipment frame: one layer from \"stock:<name>\"");
  if (style === "place" && plan.shots.filter((s) => s.kind === "stock" && stock.find((x) => x.name === s.stock)?.own && !stock.find((x) => x.name === s.stock)?.base).length < 2) errs.push("a place Reel shows 2 to 4 of the restaurant's own place photos (stock shots of its own photos)");
  if (music.length && !music.some((m) => plan.music_register.toLowerCase().includes(m.split(" (")[0].split(":")[0].toLowerCase()))) errs.push(`music_register "${plan.music_register}" is not one of: ${music.join("; ")}`);
  if (text.length && !text.includes(plan.text_style)) errs.push(`text_style "${plan.text_style}" is not one of: ${text.join(", ")}`);
  if (plan.texts.length > texts) errs.push(`more than ${texts} text lines`);
  return errs;
}

const DAILIES = {
  type: "object", additionalProperties: false, required: ["food_true", "craving", "realism", "windows", "avoid", "fixes"],
  properties: {
    food_true: { type: "boolean", description: "Wherever the food is clearly seen it is image 1's real dish: same cut, cheese, color, gloss and portion. False only when the take shows another food, not for one bad second." },
    craving: { type: "integer", description: "0-10, the best seconds of this take." },
    realism: { type: "integer", description: "0-10, the best seconds of this take." },
    windows: { type: "array", items: { type: "object", additionalProperties: false, required: ["at", "dur", "shows", "beat", "quality", "punch"], properties: {
      at: { type: "number", description: "Start in seconds, read off the sheet." },
      dur: { type: "number", description: "0.4 to 2.5 s." },
      shows: { type: "string" },
      beat: { type: "boolean", description: "It shows this shot's key action." },
      quality: { type: "integer", description: "0-10: how real and how appetizing these exact seconds are." },
      punch: { type: "string", description: "If a tight crop makes it stronger, 1-4 plain English words naming what to frame (\"ketchup stream\"); else empty." },
    } } },
    avoid: { type: "array", items: { type: "object", additionalProperties: false, required: ["at", "dur", "why"], properties: {
      at: { type: "number" }, dur: { type: "number" }, why: { type: "string" } } } },
    fixes: { type: "array", items: { type: "string" }, description: "When no good window shows the key action: what to change in the motion prompt or the first frame. Else empty." },
  },
};

// Muse watches one take the way the director watched the dailies by hand: not "approve the 4 s or throw it away", but
// which seconds go in the Reel. Until 30 Oct every take's best seconds went in, and the owner liked those Reels (Pikalo
// used 4 takes Muse had rejected); from then on only takes Muse approved whole went in, the review grew stricter rule by
// rule, and the Reels shrank to 2-7 cuts padded with photos and stock flames.
export async function dailies(photo, video, sheet, card, shot, start, playbook, payoff = false) {
  const f = await client.files.create({ file: fs.createReadStream(video), purpose: "user_data" });
  return ask([
    { type: "input_text", text: `You are the editor of a restaurant's Reel, watching the dailies. Image 1 is the restaurant's real dish. Image 2 is the first frame of this take. Image 3 shows the take's frames in order, each stamped with its time. The attached video is the take itself, a 4 s low-resolution draft (judge content, not sharpness).
The shot: ${JSON.stringify({ kind: shot.kind, what: shot.what, hands: shot.hands || "" })}${shot.kind === "trick" ? " (a trick: only hands move and no food may appear)" : ""}${shot.kind === "spread" ? " (a spread: image 1 and image 2 are the restaurant's real dishes together on one table; only the camera may move, and any dish that moves, changes, melts into another or vanishes is not the real food)" : ""}
Dish card: ${JSON.stringify({ ingredients: card.ingredients, assembly: card.assembly })}
Mark every window of 0.4-2.5 s worth putting in the Reel: real-looking, appetizing, every change with a visible cause. A window must show something happen that you can see finish (it breaks, lifts high, drips, stretches, opens): a fork or a hand that hovers, touches or lifts "a little" and does nothing is quality 3 at most (Bohío's mangú, 4 Nov: "la mayoría de los cortes son el tenedor queriendo hacer algo y no hace nada"). A clean second right next to a bad one is still a good window: the edit cuts around the bad one.${payoff ? " This take is the Reel's payoff: if the key moment plays well, give one window of 1.2-2.6 s that runs through it and holds after it." : ""}
Watch the take the way the cook and the diner would: where every drop lands and how every hand holds the food. Anything they would find wrong is to avoid, even if nothing below names it (the lime squeezed onto the plate instead of the tacos, Dora, 4 Nov).
Mark what to avoid, with its seconds: food that morphs, appears, vanishes, merges or changes count; melted cheese that pours, gushes or cascades like a sauce, or a sauce or cheese sauce the dish does not have (real melted cheese stretches in strings and sags; Pikalo's fries and Santia's empanada poured liquid cheddar on 4 Nov); a logo, label or print on the cup, box or plate that fades, changes or disappears (Purple Bear's cup lost its bear, 3 Nov); hands that do not fit the moment (the owner: in preparation not bare hands, eating yes): bare fingers handling food at the stove or the counter, or gloved and bare hands swapping inside the same setting; a cook in gloves at the plancha and a diner's bare hand at the plate are both right; food, a plate or a place that is not the one in image 2 (a cut to a griddle or a table that was never there is the video model's drawing); a hand or grip nobody uses (a folded taco lifted by one edge); someone or something popping in; a background that changes inside the take; food paler, duller or puffier than in image 1; blur.
Hard cuts the video model put inside the take are normal editing: judge continuity only between cuts.
${tasteText(playbook)}
Times between 0 and 4.0 s; at + dur never past 4.0.` },
    await img(photo), await img(start), await img(sheet), { type: "input_file", file_id: f.id },
  ], "dailies", DAILIES);
}
// A take covers its shot when a good window shows the key action, long enough for its place in the Reel.
export const covers = (d, payoff = false) => d.food_true && d.windows.some((w) => w.beat && w.quality >= 6 && w.dur >= (payoff ? 1.0 : 0.5));

const MOMENTS = {
  type: "object", additionalProperties: false, required: ["moments"],
  properties: { moments: { type: "array", items: { type: "object", additionalProperties: false, required: ["at", "dur", "what", "score", "punch"], properties: {
    at: { type: "number", description: "Start, in seconds, read off the sheet." },
    dur: { type: "number" },
    what: { type: "string" },
    score: { type: "integer", description: "0-10: how strong and how real this piece looks." },
    punch: { type: "string", description: "If a tight crop makes it stronger, 1-4 plain English words naming what to frame (\"ketchup stream\"); else empty." },
  } } } },
};

// Muse watches an approved clip, with a sheet of its frames stamped with their time, and picks the pieces worth showing.
export async function pickMoments(photo, video, sheet, shot, payoff = false) {
  const f = await client.files.create({ file: fs.createReadStream(video), purpose: "user_data" });
  return (await ask([
    { type: "input_text", text: `Image 1 is the restaurant's real dish. The attached video is one 4 s clip of a Reel about it: "${shot.what}". Image 2 shows its frames in order, each stamped with its time in seconds.
You are the editor of a fast food Reel. Pick every piece of this clip worth showing: windows of 1-2.5 s where the action plays through and the food looks its best.${payoff ? " This clip is the payoff: also give one piece of 1.6-2.6 s that runs through the key moment (the bite lifted, the stretch, the break) and holds after it." : ""}
Skip any second with blur, morphing, a hand that looks wrong, something that pops in or out, or food paler or duller than in image 1. Times between 0 and 4.0 s; at + dur never past 4.0.` },
    await img(photo), await img(sheet), { type: "input_file", file_id: f.id },
  ], "moments", MOMENTS)).moments;
}

const CUT = {
  type: "object", additionalProperties: false, required: ["cuts", "texts"],
  properties: {
    cuts: { type: "array", items: { type: "object", additionalProperties: false, required: ["piece", "at", "dur", "punch", "payoff"], properties: {
      piece: { type: "string", description: "The piece id." },
      at: { type: "number", description: "Start inside the piece's clip, within the piece's window; stills and stock keep the piece's own." },
      dur: { type: "number" },
      punch: { type: "boolean", description: "Use the piece's tight crop." },
      payoff: { type: "number", description: "Only on the last cut: seconds into it where the key action peaks. Else -1." },
    } } },
    texts: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "from", "to"], properties: {
      text: { type: "string" },
      from: { type: "integer", description: "Index of the cut where it appears (0 = first cut)." },
      to: { type: "integer", description: "Index of the last cut it stays on." },
    } } },
  },
};

const RHYTHM = {
  "fast cut": "Fast cut: pieces of 0.4-0.8 s, 14-20 cuts, a punch-in now and then (never twice in a row), and a 1.5-2.5 s hold on the payoff.",
  "long takes": "Long takes: 4-7 cuts of 1.5-3 s where each action plays through, and the payoff held 2-3 s.",
};

// Muse assembles the final cut from the good windows of every take, the stills and the stock: hook first, then the
// story, payoff last, and places the planned text lines on the cuts. `note` is what the last cut got wrong.
export async function cutReel(concept, pieces, playbook, note = "", seconds = 11, { rhythm = "fast cut", texts = [] } = {}) {
  return ask([{ type: "input_text", text: `You cut a restaurant's Reel of about ${seconds} s (9-13 s; the story decides the exact length). It must feel like a Reel filmed on a phone and cut in the app by someone with taste, not like an ad.
Idea: ${JSON.stringify({ title: concept.title, idea: concept.idea, hook: concept.hook })}
${RHYTHM[rhythm] || RHYTHM["fast cut"]}
${tasteText(playbook)}
${note ? `What the last cut got wrong, to fix in this one:\n${note}\n` : ""}Pieces: the good windows of every take (id, the shot it comes from, where the window sits in its clip, what it shows, its quality, whether it shows the shot's key action, whether it has a tight crop), and the stills and stock:
${pieces.map((p) => JSON.stringify(p)).join("\n")}
Rules:
- The first cut is the hook, at most 1.0 s: the single most striking piece.
- Then the story in shot order, so the dish is built, opened or revealed in the order it really happens. Every shot that has a piece shows up.
- A cut stays inside its piece's window. No two cuts show the same seconds of a clip. ${concept.axes?.style === "letters" ? "Stills 0.5-1.2 s, up to 6: the text carries the story, so the cut leaves each line on screen long enough to read." : "Stills 0.4-0.6 s, at most 2."} A spread piece (the camera passing over all the dishes on one table) plays 1.2-2.2 s, usually near the start.
- A piece where nothing moves (the dish just sitting there) plays at most 0.4 s, and at most twice in the Reel: the viewer stays for things happening.
- Once a dish changes on screen (a yolk breaks, a bite is taken, a piece is pulled away), never cut back to it whole after that.
- The moment a hand picks one piece out of several (a taco out of three) is where the video model slips most: let it pass in a blink, or cut in once the piece is already in the hand.
- The last cut is the payoff, from the last diner shot's best window, with payoff set to the second inside it where the key action peaks.
- The cuts add up to ${seconds - 1}-${seconds + 1} s. If the pieces run short, let the strong ones play longer inside their windows.
Text lines to place (shot 0 is the hook): ${texts.length ? JSON.stringify(texts) : "none"}. Each stays 1.5-3 s on screen, starting on the cut of its shot; the hook starts on cut 0.` }], "cut", CUT);
}

const REEL_REVIEW = {
  type: "object", additionalProperties: false, required: ["earlier", "approved", "craving", "realism", "rhythm", "hook", "reel_not_ad", "idea_on_screen", "problems", "false_texts", "note"],
  properties: {
    earlier: { type: "array", description: "Every problem you named at an earlier look of this Reel, checked on screen again; empty when there was no earlier look.", items: { type: "object", additionalProperties: false, required: ["problem", "still_there"], properties: {
      problem: { type: "string" }, still_there: { type: "boolean", description: "True if you can still see it anywhere in this cut." },
    } } },
    approved: { type: "boolean" },
    craving: { type: "integer", description: "0-10" },
    realism: { type: "integer", description: "0-10: does every second look like real footage?" },
    rhythm: { type: "integer", description: "0-10: does the cut feel like a top food creator's?" },
    hook: { type: "integer", description: "0-10: does the first second stop the scroll?" },
    reel_not_ad: { type: "integer", description: "0-10: does it feel like a Reel someone filmed and cut, not a commercial or an animation?" },
    idea_on_screen: { type: "boolean", description: "The beat that makes this idea (the steal, the unwrap, the trick, the place) actually happens on screen, not only in the text." },
    problems: { type: "array", items: { type: "string" }, description: "Each with its second in the Reel." },
    false_texts: { type: "array", items: { type: "string" }, description: "On-screen lines, exactly as they read, that state something the menu, the photos or the owner never said (a count, a claim, an ingredient, how it is cooked: \"oven-baked\" when nobody said so); empty if none." },
    note: { type: "string", description: "Two short sentences to the owner, in Spanish." },
  },
};

// Muse's last look at the finished Reel, as the owner would watch it, with the owner's verdicts on earlier Reels in mind.
// Its earlier looks come with it: on 4 Nov Muse rejected Pikalo's bread at its third look and approved the very same
// file at a fourth. A problem it named stays until a look shows it gone.
export async function reviewReel(photo, video, card, playbook, plan, others = [], earlier = []) {
  const f = await client.files.create({ file: fs.createReadStream(video), purpose: "user_data" });
  return ask([
    { type: "input_text", text: `Image 1 is the restaurant's real dish. The attached video is the finished Reel about it, about to go to the owner. This is how we make Reels and what the owner said about the ones already made:
${loadCraft()}

Dish card: ${JSON.stringify({ ingredients: card.ingredients, assembly: card.assembly })}
The plan it was cut from: ${JSON.stringify(plan)}
${others.length ? `Images ${others.map((o, i) => `${i + 2} (menu ${o.id}, ${o.name})`).join(", ")} are the restaurant's real photos of the other dishes that appear; each must look like its own photo.\n` : ""}${tasteText(playbook)}
Watch it as a stranger scrolling Instagram, then as the owner. Approve only if craving >= 7, realism >= 7, hook >= 7, reel_not_ad >= 7, it runs at least 9 s, no cheese pours or cascades like a sauce and no sauce appears that the dish does not have, no piece of the same take plays twice, the food is the real dish everywhere, the hands are the same kind all through (bare or gloved), and what makes the idea is on screen (its place, its other dishes, its trick): text that announces a beat the video never shows ("and then he took it" over a hand dipping) means the idea is not on screen.${earlier.length ? `
At earlier looks of this Reel you named these problems. Look for each one again in this cut, second by second; one still there means not approved:
${earlier.map((p) => `- ${p}`).join("\n")}` : ""}` },
    await img(photo), ...(await Promise.all(others.map((o) => img(o.photo)))), { type: "input_file", file_id: f.id },
  ], "reel_review", REEL_REVIEW).then((r) => (r.earlier.some((e) => e.still_there) ? { ...r, approved: false, problems: [...new Set([...r.problems, ...r.earlier.filter((e) => e.still_there).map((e) => e.problem)])] } : r));
}

const FIX = {
  type: "object", additionalProperties: false, required: ["drop", "recut", "reshoot"],
  properties: {
    drop: { type: "array", items: { type: "string" }, description: "Ids of the pieces that show a problem you named (wrong food, a jump, something AI): they are taken out and no cut can use them again." },
    recut: { type: "string", description: "What the next cut must do differently with the pieces it has. Empty if a new cut fixes nothing." },
    reshoot: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "why"], properties: {
      n: { type: "integer", description: "The AI shot's number in the plan." },
      why: { type: "string", description: "What the new clip must get right." },
    } } },
  },
};

// Muse rejected the finished Reel: instead of stopping, it decides how to fix every problem it named. A new cut from the
// pieces it has is free; shooting a clip again costs a draft. Clips the owner approved are never shot again.
export async function fixReel(review, plan, pieces, cuts, locked, playbook, last = false) {
  return ask([{ type: "input_text", text: `You rejected this Reel. Fix it; do not give up on it.
Your review: ${JSON.stringify({ problems: review.problems, note: review.note })}
The plan's shots: ${JSON.stringify(plan.map(({ n, kind, what }) => ({ n, kind, what, ...(locked.includes(n) ? { locked: "the owner approved this clip: never shoot it again" } : {}) })))}
The pieces a cut can use: ${pieces.map((p) => JSON.stringify({ id: p.id, shot: p.shot, kind: p.kind, at: p.at, dur: p.dur, what: p.what })).join("\n")}
The cut you rejected: ${JSON.stringify(cuts)}
${playbookText(playbook)}
Ways to fix a problem:
- drop, free: name every piece that shows a problem. It is taken out for good, so the next cut cannot play it again.
- recut, free: a new cut from the pieces left (other pieces, another order, another opening, longer holds). Say what the next cut must do.
${last ? "This is the last fix: nothing can be shot again (leave reshoot empty). Drop what is wrong; a shorter Reel that is true beats a longer one you rejected." : "- reshoot, one draft each: shoot an AI shot (build, diner or guest) again when the problem is inside its clip and no piece of it avoids it. Say what the new clip must get right."}
Fix every problem you can. Leave out only what none of these can fix (a photo the restaurant never gave us).` }], "fix", FIX);
}

const PHOTO_CHECK = {
  type: "object", additionalProperties: false, required: ["photos", "problems"],
  properties: {
    photos: { type: "integer", description: "0-10: can these exact photos carry this Reel full screen on a phone?" },
    problems: { type: "array", items: { type: "string" }, description: "Each naming the dish and what is wrong with its photo; empty if none." },
  },
};

// Santia's empanada, 4 Nov: its DoorDash photo was taken on an office desk, the Reel showed the laptop and the meat
// falling on the desk (Yansel: "devastador"). Where each photo was taken is written down, and a dish photographed away
// from a restaurant is moved onto a restaurant table before any shot (src/auto.mjs).
const PHOTO_RATE = {
  type: "object", additionalProperties: false, required: ["setting", "score", "problems"],
  properties: {
    setting: { type: "string", enum: ["restaurant", "plain table or counter", "studio", "home", "office or desk", "car", "takeout packaging only", "other"], description: "Where the photo was taken, from everything around the food." },
    score: { type: "integer", description: "0-10: can the food in this photo carry a Reel full screen on a phone (sharp, well lit, food big and appetizing, nothing over it)? Judge the food and the light; the setting is noted above, and a dish photographed away from a restaurant is moved onto a restaurant table before any shot." },
    problems: { type: "array", items: { type: "string" }, description: "Short, concrete; empty if none." },
  },
};

// One menu photo, full size, rated once and kept in the kit (photos.json).
export async function ratePhoto(file, name) {
  return ask([{ type: "input_text", text: `This is the restaurant's own photo of "${name}", full size. Would it carry a food Reel full screen on a phone, cropped to vertical? Judge sharpness, light, how big and appetizing the food is, and anything on top of it (text, logos, prices, stickers, a phone, a hand).` }, await img(file)], "photo_rate", PHOTO_RATE);
}

// The pitch judges photos from 256 px thumbnails, too small to see blur, dark corners or food cut off by the frame.
// The best ideas get their photos looked at full size before one is chosen. Yansel, 2 Nov: "ver la foto en grande
// ayudaria bastante".
export async function checkPhotos(concept, photos) {
  return ask([
    { type: "input_text", text: `This Reel will be made from these exact photos of the restaurant's dishes, shown full size. The first is the hero: the Reel lives on it.
Idea: ${concept.idea}
Shots: ${JSON.stringify(concept.shots)}
Look at each photo as it will play full screen on a phone: is it sharp, well lit, the food big and appetizing, nothing the idea needs cut off by the frame or hidden?
The hands, the motion, the drip, the box and the text are made later from this photo (the video model animates it, the edit crops and pushes in, the text is typed on top). Never mark a photo down for not already showing the action; judge only whether the photo of the food itself can carry it (Dora's nachos photo was marked 2 for "no hand, no lifted chip" the day its Reel passed, 4 Nov).` },
    ...(await Promise.all(photos.flatMap(async (p) => [{ type: "input_text", text: `${p.name}:` }, await img(p.file)]))).flat(),
  ], "photo_check", PHOTO_CHECK);
}

// ---- The stock library: Muse watches free equipment footage and keeps only what can sit inside a restaurant's Reel. ----

const STOCK_VERDICT = {
  type: "object", additionalProperties: false, required: ["keep", "reason", "name", "what", "moments"],
  properties: {
    keep: { type: "boolean" },
    reason: { type: "string", description: "One line: why it is kept or rejected." },
    name: { type: "string", description: "Short lowercase slug for the clip, e.g. 'grill-flames', 'wok-fire'." },
    what: { type: "string", description: "What the clip shows, in one plain English line, as a planner would pick it." },
    moments: { type: "array", items: { type: "object", additionalProperties: false, required: ["at", "dur", "x", "what"], properties: {
      at: { type: "number", description: "Start in seconds, read off the sheet." },
      dur: { type: "number", description: "0.4-0.8 s." },
      x: { type: "number", description: "0-1: the horizontal center of the action, where a vertical 9:16 crop of a wide frame goes." },
      what: { type: "string" },
    } } },
  },
};

export async function judgeStock(video, sheet, title) {
  const f = await client.files.create({ file: fs.createReadStream(video), purpose: "user_data" });
  return ask([
    { type: "input_text", text: `You stock a library of real footage for food Reels made for small independent restaurants. Each Reel shows the restaurant's own food (from its own photos) and cuts in a few short pieces of real equipment and places, so the whole Reel reads as filmed in a working kitchen.
The attached video is a free stock clip titled "${title}". The image shows its frames, each stamped with its time in seconds.
Keep it only if every piece you pick shows real equipment, fire, oil, steam, smoke, a working kitchen or a place (a street at night, a counter, a sign without words), and:
- no food a viewer could take for a dish (a steak, a burger, fries, a pizza): the food in a Reel is always the restaurant's own. Bubbling oil, flames, smoke, steam, an empty pan or basket are fine.
- no face; hands and arms are fine.
- no logo, brand, readable text or watermark.
- a professional kitchen or a real place, not a home kitchen; sharp and well lit.
Pick 1 to 4 moments of 0.4-0.8 s that read at a glance, avoiding any second that breaks a rule. Give each the horizontal center of its action, for a vertical crop.` },
    await img(sheet), { type: "input_file", file_id: f.id },
  ], "stock_verdict", STOCK_VERDICT);
}
