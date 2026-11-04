// Muse groups the studied Reels (data/formats/) into families: Reels that work for the same core idea are one
// format, however different they look. A new Reel that repeats a family makes it stronger, not a new idea.
// Yansel approves or drops each family (approved: true / false in data/families.json); only approved ones reach the pitch.
import fs from "node:fs";
import { ask, loadRecipes } from "./director.mjs";

const FAMILIES = {
  type: "object", additionalProperties: false, required: ["families"],
  properties: { families: { type: "array", items: { type: "object", additionalProperties: false,
    required: ["name", "core", "reels", "beats", "people", "can_make", "needs_camera", "variants", "fits", "es_name", "es_core", "es_can", "es_camera"],
    properties: {
      name: { type: "string", description: "Short reusable name of the format." },
      core: { type: "string", description: "The one idea every Reel in it shares." },
      reels: { type: "array", items: { type: "string" }, description: "The ids of its Reels." },
      beats: { type: "string", description: "The shared structure a new Reel of this family follows, beat by beat with rough times." },
      people: { type: "string", description: "Who is on screen and what they do, or nobody." },
      can_make: { type: "string", description: "What of it we can make from menu photos, the house cast, 4 s AI clips and the edit." },
      needs_camera: { type: "string", description: "What only a real camera in the real place gives, or nothing." },
      variants: { type: "string", description: "How its Reels differ from each other: the ways to keep it fresh each time." },
      fits: { type: "string", description: "Which dishes and restaurants it suits." },
      es_name: { type: "string", description: "Its name in plain Spanish, for the owner's review." },
      es_core: { type: "string", description: "One plain Spanish sentence: what it is and why it works." },
      es_can: { type: "string", description: "One plain Spanish sentence: what we can make of it." },
      es_camera: { type: "string", description: "One plain Spanish sentence: what needs a real camera, or \"Nada\"." },
    } } } },
};

const PROMPT = `These are food Reels that performed well, each studied shot by shot. Group them into families by their core idea: what makes each one work, not how it looks. The dish, the music, the colors and the text are decoration.
A family is the mechanism a viewer would recognize, broad enough that one restaurant could make a fresh Reel of it every week with other dishes, people and props. Reels that differ only in the trigger, the setting or the gag around the same mechanism are one family, and those differences are its variants: a pinch on a phone, a tap on a menu, a wipe of the lens and a game board that turns over are all "the food appears by magic"; plates that walk past you, get carried off or get eaten by friends are all "the food you wanted goes to someone else". So there are far fewer families than Reels. Every Reel goes in exactly one family; a family of one is only for an idea no other Reel shares. Never merge two mechanisms a viewer would tell apart just to have fewer families.
For each family write the shared structure a new Reel would follow, who is on screen, how its Reels differ (the ways to make it fresh each time), and honestly what we can make of it: we have the restaurant's real menu photos, its house cast (AI-drawn models who hold and show the food and never eat), 4 s AI video clips started from a photo, and the edit. Say what only a real camera in the real place could give.

{REELS}`;

const brief = (r) => `[${r.id}] ${r.format}. Core: ${r.core ?? r.why_it_works}. Dish: ${r.dish}. Hook: ${r.hook}. People: ${r.people}. Shots: ${r.shots.map((s) => `${s.start}-${s.end}s ${s.framing}, ${s.action}, ${s.camera}`).join(" | ")}. Text: ${r.text_on_screen}. Audio: ${r.audio_role}. Why: ${r.why_it_works}.${r.can_make ? ` We can make: ${r.can_make}. Needs a camera: ${r.needs_camera}.` : ""}${r.picked_because ? ` Picked because: ${r.picked_because}.` : ""}`;

export async function groupFamilies(dir = "data/formats") {
  const reels = loadRecipes(dir), ids = reels.map((r) => r.id);
  for (let k = 0; k < 2; k++) {
    const { families } = await ask([{ type: "input_text", text: PROMPT.replace("{REELS}", reels.map(brief).join("\n\n")) }], "families", FAMILIES);
    // Every Reel exactly once: a Reel dropped or counted twice would skew what the pitch learns.
    const seen = families.flatMap((f) => f.reels), missing = ids.filter((i) => !seen.includes(i)), twice = seen.filter((i, n) => seen.indexOf(i) !== n);
    if (!missing.length && !twice.length && seen.every((i) => ids.includes(i))) return families.map((f) => ({ ...f, approved: null }));
    console.log(`  regroup: missing ${missing.join(", ") || "none"}, twice ${twice.join(", ") || "none"}`);
  }
  throw new Error("Muse could not place every Reel in exactly one family");
}
