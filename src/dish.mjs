// What the dish really is, before anyone films it.
// Muse Spark reads it like a line cook who works at the restaurant: the menu says WHAT is in it,
// the photo says HOW it looks, and the owner settles what neither can (which protein, how a step is done).
// SAM 3.1 then cuts each visible ingredient out of the real photo, so later frames are drawn from the
// restaurant's own guacamole, bread and meat, not from a model's idea of them.
import OpenAI from "openai";
import sharp from "sharp";
import { segmentObjects } from "./layers.mjs";

const client = new OpenAI({ baseURL: "https://api.meta.ai/v1", apiKey: process.env.META_API_KEY, maxRetries: 6 });

const CARD = {
  type: "object", additionalProperties: false,
  required: ["dish", "ingredients", "assembly", "conflicts", "questions"],
  properties: {
    dish: { type: "string" },
    ingredients: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["name", "sam_concept", "source", "visible_in_photo", "looks", "kitchen", "confidence"],
        properties: {
          name: { type: "string" },
          sam_concept: { type: "string", description: "1-3 plain English words a segmentation model can find in the photo, e.g. 'guacamole', 'bread roll'." },
          source: { type: "string", enum: ["menu", "photo", "owner"] },
          visible_in_photo: { type: "boolean" },
          looks: { type: "string", description: "Exactly how it looks in this photo: cut, piece size, color, texture, melted or not, where it sits." },
          kitchen: { type: "string", description: "How a line cook at this restaurant prepares it: station and technique, e.g. 'cheese slices laid on the meat on the plancha until they melt'." },
          confidence: { type: "number", description: "0-1, how sure you are of this ingredient as described." },
        },
      },
    },
    assembly: { type: "array", items: { type: "string" }, description: "The real order a cook makes and builds the dish, one step per item, with the technique." },
    conflicts: { type: "array", items: { type: "string" }, description: "Where the menu and the photo disagree or the photo hides something." },
    questions: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["ask", "options", "why"],
        properties: {
          ask: { type: "string", description: "Short question to the owner, in the owner's language." },
          options: { type: "array", items: { type: "string" }, description: "Answers to tap, taken from the menu when possible." },
          why: { type: "string", description: "What in the video depends on it." },
        },
      },
    },
  },
};

const PROMPT = `You have worked the line for years at this restaurant: {RESTAURANT}. You are about to brief a video team that will film this dish being made and eaten, so every ingredient and every kitchen step must be exactly how THIS kitchen does it.
Menu item: {MENU}
Owner's answers so far: {ANSWERS}
The menu is the truth about WHAT is in the dish: its description and its add-ons (the option groups a customer picks from, like the sauce, the protein or the dip). The photo is the truth about HOW it looks here. The owner's words beat both: the item's ai_note (the owner's own note on it in Domi) and the answers.
For each ingredient: how it looks in the photo (be literal: what you can actually see, piece size, color, melted or not) and how a cook prepares it (station and technique). Then the build order, step by step, as it happens on the line.
List conflicts between the menu and the photo (for example a sauce in the photo you cannot map to the menu, or an ingredient on the menu you cannot see).
The Reel this card is for: {CONCEPT}
Ask the owner only what changes THIS Reel and you cannot know: a question about something the Reel never shows (how it is cooked when no cooking is filmed, what is inside when it is never opened) is never asked; the card writes it as unknown. Yansel, 2 Nov: "por que preguntarme si ya sabes?". At most 3 questions, short, in {LANG}, with options from the menu. Never ask what you can see, what the owner already said, what the description or the add-ons say, or what the dish's name already means (Buffalo wings come in buffalo sauce). What neither the menu nor the photo shows (a dip, a side) stays out of the video: do not ask about it. If there is nothing to ask, return no questions.`;

export async function dishCard({ photo, menu, answers = {}, lang = "Spanish", concept = null }) {
  const jpg = await sharp(photo).rotate().resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  const res = await client.responses.create({
    model: "muse-spark-1.3",
    input: [{ type: "message", role: "user", content: [
      { type: "input_text", text: PROMPT.replace("{RESTAURANT}", menu.restaurant).replace("{MENU}", JSON.stringify(menu))
        .replace("{ANSWERS}", Object.keys(answers).length ? JSON.stringify(answers) : "none yet").replace("{LANG}", lang).replace("{CONCEPT}", concept ? JSON.stringify({ idea: concept.idea, format: concept.format }) : "not chosen yet: ask only what any Reel of it would need.") },
      { type: "input_image", image_url: `data:image/jpeg;base64,${jpg.toString("base64")}` },
    ] }],
    text: { format: { type: "json_schema", name: "dish_card", schema: CARD, strict: true } },
  });
  return JSON.parse(res.output_text);
}

// Crops of each visible ingredient from the real photo (largest SAM object, padded), as references.
export async function ingredientRefs(photo, card) {
  const img = sharp(photo).rotate();
  const jpg = await img.jpeg({ quality: 92 }).toBuffer();
  const { width, height } = await sharp(jpg).metadata();
  const visible = card.ingredients.filter((i) => i.visible_in_photo);
  const refs = await Promise.all(visible.map(async (ing) => {
    const masks = await segmentObjects(jpg, width, height, ing.sam_concept).catch(() => []);
    if (!masks.length) return null;
    let best = null;
    for (const m of masks) {
      let x1 = width, y1 = height, x2 = 0, y2 = 0, n = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (m[y * width + x]) {
        n++; if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
      }
      if (n && (!best || n > best.n)) best = { n, x1, y1, x2, y2 };
    }
    // Tiny or whole-frame hits are not a usable reference for one ingredient.
    if (!best || best.n < width * height * 0.002 || best.n > width * height * 0.6) return null;
    const pad = Math.round(Math.max(best.x2 - best.x1, best.y2 - best.y1) * 0.15);
    const left = Math.max(0, best.x1 - pad), top = Math.max(0, best.y1 - pad);
    const crop = await sharp(jpg).extract({ left, top, width: Math.min(width, best.x2 + pad) - left, height: Math.min(height, best.y2 + pad) - top })
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: false }).jpeg({ quality: 90 }).toBuffer();
    return { name: ing.name, crop, share: +(best.n / (width * height)).toFixed(3) };
  }));
  return refs.filter(Boolean);
}
