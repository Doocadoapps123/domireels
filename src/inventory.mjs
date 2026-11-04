// What can I make with what I have? Before any idea, Muse looks at every good dish photo the way the Reels directed by
// hand were planned: which layers the photo can be peeled into, what a hand can do to the real dish, whether it can
// start wrapped, where the kitchen cooks it, how many separate pieces sit on the plate, and its one hungriest moment.
// Ideas are then pitched only from what the photos can really carry (data/craft.md), and the week's kinds of Reel
// are drawn only among the ones this restaurant's photos can make (src/week.mjs).
// Kept in the kit as inventory.json, keyed by the photo's content, so each photo is looked at once.
import fs from "node:fs";
import crypto from "node:crypto";
import { ask, img } from "./director.mjs";
import { readMenu } from "./menu.mjs";

// Pikalo, 4 Nov: Muse planned a fork lifting a Big Papi Sandwich; Yansel: "se supone que debe saber que un sandwich no
// va con tenedor". How a dish is eaten is written down first, and every hand action has to agree with it.
const EATEN = ["hands", "fork", "spoon", "fork and knife", "chopsticks", "a straw or a sip", "toothpick"];
const TOOLS = /\b(fork|knife|spoon|chopstick|tongs|toothpick|straw)s?\b/gi;
// A hand action with a tool the dish is not eaten with goes (a fork on a sandwich); a dish eaten with hands keeps only bare-hand actions.
const truthful = (look) => {
  const ok = new Set((look.eaten_with.match(TOOLS) || []).map((t) => t.toLowerCase().replace(/s$/, "")));
  return { ...look, hands: look.hands.filter((h) => (h.match(TOOLS) || []).every((t) => ok.has(t.toLowerCase().replace(/s$/, "")))) };
};

const STATIONS = ["fryer", "plancha", "grill", "oven", "wok", "pot", "blender", "espresso", "cold", "none"];
const LOOK = {
  type: "object", additionalProperties: false,
  required: ["eaten_with", "held", "layers", "closed", "hands", "wrap", "station", "melt", "liquid", "pieces", "hungriest", "weak"],
  properties: {
    eaten_with: { type: "string", enum: EATEN, description: "How people really eat this dish where it comes from. A sandwich, a burger, a taco, an empanada, a pastelito, a slice of pizza: hands. Rice, a stew, a cake slice on a plate: fork. A soup: spoon." },
    held: { type: "string", description: "How a person really holds it to eat, in one line (\"both hands around the sandwich half, thumbs under\", \"a slice of cake on a fork, plate in the other hand\")." },
    layers: { type: "array", items: { type: "string" }, description: "The dish's visible layers from the TOP down, each one a real step a cook adds and an image editor can take off the photo (\"cheese sauce lines\", \"melted cheese slices\", \"shredded pork\", \"fries\"). The container itself is not a layer. Empty if the dish is not built in visible layers or its filling is closed inside bread, tortilla or dough." },
    closed: { type: "boolean", description: "Its filling is closed inside bread, a tortilla, dough or a wrapper (a burrito, a pressed sandwich, an empanada)." },
    hands: { type: "array", items: { type: "string" }, description: "2-5 things a hand (or the utensil it is eaten with) can do to THIS real dish with what is already on the plate, the way people really eat it: \"lift a wing and let the buffalo sauce drip\", \"dip a whole taco in the consomé cup\", \"squeeze the lime wedge over the chunks\", \"pull a half away so the cheese stretches\". Only what the photo shows is there." },
    wrap: { type: "string", description: "How this dish could first appear closed so hands open it to the real photo: \"wrapped in crinkled foil\", \"in its closed takeout box\", \"under a paper wrapper\". Empty if that would not be natural for it." },
    station: { type: "string", enum: STATIONS, description: "Where this kitchen really cooks its main part." },
    melt: { type: "boolean", description: "Melted cheese that can visibly stretch is really in it (menu, owner note or photo)." },
    liquid: { type: "string", description: "A broth, dip, sauce cup or drink in the photo a piece can be dipped in or poured from; empty if none." },
    pieces: { type: "integer", description: "How many separate pieces of food sit on the plate (3 tacos = 3; a pile of fries = 1)." },
    hungriest: { type: "string", description: "The one moment of this dish that makes people hungry, in one line." },
    weak: { type: "array", items: { type: "string" }, description: "What this photo cannot carry: food cut off by the frame, blur, text or stickers on it, nothing to pull, a dull angle. Empty if none." },
  },
};

const PROMPT = `You plan food Reels for a small restaurant, and the only footage you will ever have of this dish is this one photo: it gets peeled into layers by an image editor, animated by an image-to-video model, held as a flash, or wrapped and unwrapped (data/craft.md explains each). Before anyone pitches an idea, write down what this photo can really do.
Restaurant: {R}
Dish: {DISH}
The menu is the truth about what is in it, the photo about how it looks here, and the owner's note beats both. Write only what you can see or were told. Answer every field for this exact photo.`;

const hashOf = (file) => crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 16);

// Looks at every dish whose photo can carry a Reel (min score) and is not yet in inventory.json. Returns the inventory
// as [{ id, name, photo, score, ...look }], best photos first.
export async function inventory(dir, { min = 6, max = 16 } = {}) {
  const file = `${dir}/inventory.json`, done = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  const menu = readMenu(dir), r = `${menu.restaurant} (${menu.cuisine}), ${menu.city || ""}`;
  const items = menu.items.filter((m) => m.photo && (m.photo_score ?? 0) >= min).sort((a, b) => b.photo_score - a.photo_score).slice(0, max);
  // A dish looked at before "how it is eaten" existed is looked at again.
  const todo = items.filter((m) => !done[hashOf(`${dir}/${m.photo}`)]?.eaten_with);
  for (let i = 0; i < todo.length; i += 6)
    await Promise.all(todo.slice(i, i + 6).map(async (m) => {
      const dish = JSON.stringify({ name: m.name, description: m.description || "", owner_note: m.ai_note || "", options: (m.addons || []).map((a) => `${a.group}: ${a.options.slice(0, 8).join(", ")}`) });
      const look = await ask([{ type: "input_text", text: PROMPT.replace("{R}", r).replace("{DISH}", dish) }, await img(fs.readFileSync(`${dir}/${m.photo}`))], "inventory", LOOK).catch((e) => (console.log(`${m.name}: not looked at (${e.message})`), null));
      if (look) done[hashOf(`${dir}/${m.photo}`)] = { id: m.id, name: m.name, photo: m.photo, ...truthful(look) };
    }));
  if (todo.length) fs.writeFileSync(file, JSON.stringify(done, null, 2) + "\n");
  return items.map((m) => done[hashOf(`${dir}/${m.photo}`)] && { ...done[hashOf(`${dir}/${m.photo}`)], score: m.photo_score }).filter(Boolean);
}

// The inventory as the pitch and the planner read it: one line per dish.
export const inventoryText = (inv) => inv.map((d) => [
  `${d.id}: ${d.name} [photo ${d.score}/10]`,
  d.eaten_with && `eaten with ${d.eaten_with}: ${d.held}`,
  d.layers.length ? `layers top-down: ${d.layers.join(" > ")}` : d.closed ? "closed: cannot be peeled" : "not layered",
  `hands: ${d.hands.join("; ")}`,
  d.wrap && `can start ${d.wrap}`,
  d.station !== "none" && `cooked: ${d.station}`,
  d.melt && "cheese stretches",
  d.liquid && `to dip or pour: ${d.liquid}`,
  `${d.pieces} piece${d.pieces === 1 ? "" : "s"}`,
  `hungriest: ${d.hungriest}`,
  d.weak.length && `weak: ${d.weak.join("; ")}`,
].filter(Boolean).join(" | ")).join("\n");
