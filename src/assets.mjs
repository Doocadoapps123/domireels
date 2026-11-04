// The restaurant's own assets. Muse looks at every photo the owner sent (library/) and says what it is:
// a dish, their griddle, their fryer, their kitchen, their dining room, their storefront. A Reel reaches for
// these first; the emergency gallery (data/stock.json) only covers what the restaurant has not sent.
// Writes assets.json in the kit folder. A photo already sorted is not looked at again.
import fs from "node:fs";
import { ask, img } from "./director.mjs";

const KINDS = ["dish", "equipment", "kitchen", "dining_room", "storefront", "staff", "other"];
const ASSET = {
  type: "object", additionalProperties: false, required: ["kind", "label", "what", "dish", "faces", "usable", "why", "focus"],
  properties: {
    kind: { type: "string", enum: KINDS },
    label: { type: "string", description: "What it is in 1-3 plain English words: \"flat-top griddle\", \"deep fryer\", \"pizza oven\", \"storefront sign\", \"counter\". For a dish, its name." },
    what: { type: "string", description: "What the photo shows, in one line, as an editor would log it." },
    dish: { type: "integer", description: "dish: its menu number if it is one of the menu's dishes, else 0." },
    faces: { type: "boolean", description: "A person's face can be recognized." },
    usable: { type: "boolean", description: "Good enough to hold on screen for half a second in a Reel: sharp enough, lit, shows the thing clearly, no recognizable face, no other brand's logo." },
    why: { type: "string", description: "If not usable, why, in a few words. Else empty." },
    focus: { type: "string", description: "1-4 plain English words a segmentation model can find, to frame it tight in 9:16 (\"griddle\", \"fryer basket\", \"neon sign\"); empty for the whole photo." },
  },
};

const PROMPT = `You log the photos a small restaurant sent to its social media team, so a Reel editor can find its real place and equipment.
Restaurant: {R}. Its menu: {MENU}.
The owner said this photo is: {SAID}.
Log what the photo really shows. Equipment, kitchen, dining room and storefront photos are the restaurant's real place: say exactly what is in them. A photo of food is a dish: give its menu number when you can tell which one it is.`;

export async function sortAssets(dir) {
  const menu = JSON.parse(fs.readFileSync(`${dir}/menu.json`, "utf8")), kit = JSON.parse(fs.readFileSync(`${dir}/kit.json`, "utf8"));
  const file = `${dir}/assets.json`, done = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
  const list = menu.items.map((m) => `${m.id} ${m.name}`).join("; ");
  for (const l of kit.library) {
    const photo = `library/${l.id}.jpg`;
    if (!fs.existsSync(`${dir}/${photo}`) || done.some((a) => a.id === l.id)) continue;
    const a = await ask([
      { type: "input_text", text: PROMPT.replace("{R}", `${menu.restaurant} (${menu.cuisine}), ${menu.city}`).replace("{MENU}", list).replace("{SAID}", l.dish || l.kind || "nothing") },
      await img(fs.readFileSync(`${dir}/${photo}`)),
    ], "asset", ASSET);
    done.push({ id: l.id, photo, ...a, usable: a.usable && !a.faces, ...(/made by Muse/.test(l.dish || "") ? { made: true } : {}) });
    console.log(`library ${l.id}: ${a.kind}, ${a.label}${a.usable && !a.faces ? "" : ` (not used: ${a.faces ? "a face" : a.why})`}`);
    fs.writeFileSync(file, JSON.stringify(done, null, 2) + "\n");
  }
  return done;
}

// The kit's own place and equipment as entries of the planner's library, next to the emergency stock.
// They play as stills of the real photo, so they never move in a way the place does not.
export const ownStock = (dir) => (fs.existsSync(`${dir}/assets.json`) ? JSON.parse(fs.readFileSync(`${dir}/assets.json`, "utf8")) : [])
  .filter((a) => a.usable && a.kind !== "dish" && a.kind !== "staff")
  // Equipment can hold the dish: the restaurant's own food is put in its fryer basket or on its plancha (base).
  .map((a) => ({ name: `own-${a.id}`, what: `${a.label}, ${a.made ? "this restaurant's equipment" : "the restaurant's own photo"}: ${a.what}`, own: true, photo: `${dir}/${a.photo}`, focus: a.focus, base: a.kind === "equipment" }));
