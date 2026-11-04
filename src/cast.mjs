// The house cast: 3-4 young people Muse invents for a restaurant, always the same ones. They are models, used
// only when an idea needs a person on screen: they hold the dish, show it, carry the bag, react. They never eat
// on camera, except in a bite test Yansel asked for (2026-11-01) to see if a bite can look real. They are made, not real customers, and a Reel never presents them as reviews or regulars.
//   castFor   Muse Spark designs them from who really lives in the restaurant's area, never from its food (cast.json).
//   portrait  Muse Image draws each one (cast/<name>.jpg), unretouched so a phone video of them reads as real;
//             Muse checks every portrait (age, teeth, logo, and that the face is not one already cast) and redraws it.
//   lookalikes / recast  nobody repeats across restaurants, not a face and not a name (lab/unique.mjs).
//   guestFrame  the first frame of a guest shot: one or two of them with the restaurant's real dish.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ask, img } from "./director.mjs";

// Off since Yansel's bite test (2026-11-01, lab/bitetest.mjs): the guest frame redraws the dish, so the food in
// their hands is never the restaurant's real one ("la comida final debe ser una copia de la real"), and in motion
// the person reads as AI ("la persona se ve ai 100%"). Until both are solved no pitch or plan puts the cast on camera.
export const CAST_ON_CAMERA = false;
import { museEdit, W, H } from "./film.mjs";

const CAST = {
  type: "object", additionalProperties: false, required: ["area", "people"],
  properties: {
    area: { type: "string", description: "Who really lives in this city and around it, the way the census would put it: the real mix of people, in one line." },
    people: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "sex", "age", "look", "outfit", "wears", "vibe"], properties: {
      name: { type: "string", description: "A first name, lowercase ascii, used as a file name." },
      sex: { type: "string", enum: ["woman", "man"] },
      age: { type: "integer", description: "23, 24 or 25." },
      look: { type: "string", description: "Face shape, nose, eyes and brows, skin tone, hair length, texture and style, build, and one detail only they have, in plain words: good-looking the way real people that age are, never model-perfect." },
      outfit: { type: "string", enum: ["house tee", "own clothes"], description: "house tee: a plain tee with the logo small on the chest. own clothes: their everyday clothes, no logo." },
      wears: { type: "string", description: "What they wear, color included. For the house tee, its color (each tee a different color) and what they wear with it." },
      vibe: { type: "string", description: "How they pose and move for a camera, in a few words." },
    } } },
  },
};

const PROMPT = `Design the house cast of {R}, a small restaurant in {CITY}. Image 1 is its logo; the other images are its food.
First, in "area", say who really lives in {CITY} and around it, the way the census would: the real mix of people.
Then make {N} people aged 23 to 25, the age of the people who make and watch Reels, who look like the people of that area, in about that same mix: the people who live there and would walk in. Cast from the area, never from the food: what a restaurant cooks says nothing about who eats there. Different sexes. Good-looking the way real young people are: well groomed, clean, hair done, healthy complete teeth, never model-perfect.
They will be the restaurant's models: holding its dishes, showing them to the camera, carrying the bag, sometimes two of them together, so make them people who would plausibly be friends.
Their clothes vary: about half wear a plain tee with the restaurant's logo small on the chest, each tee a different color, and the others wear their own everyday clothes with no logo. No uniforms, no matching outfits, and no other brand, team or logo anywhere.
{UNIQUE}{TAKEN}`;

// The image model draws one default face for each vague description, so the same young woman came out in six
// restaurants. Every look has to be specific, and nobody already cast anywhere comes back.
const UNIQUE = `Every person is someone of their own: write each look specifically enough that two people of the same background never come out alike (face shape, nose, eyes and brows, hair length, texture and style, height and build, and one detail only they have, like glasses, a beauty mark, dimples, freckles, bangs, a short cut or a small nose stud). Never the stock look of a group, like "long dark wavy hair with a middle part".`;
const taken = (others) => (others.length ? `\nAlready cast at other restaurants, so never their names and never anyone who looks like them: ${others.map((o) => `${o.name} (${o.sex}, ${o.look})`).join("; ")}.` : "");

// Everyone already cast at the other restaurants (the sibling kits), with their portrait.
export function castElsewhere(dir) {
  const kits = path.dirname(path.resolve(dir)), me = path.basename(path.resolve(dir));
  return fs.readdirSync(kits).filter((k) => k !== me && fs.existsSync(`${kits}/${k}/cast.json`)).flatMap((k) => {
    const { people } = JSON.parse(fs.readFileSync(`${kits}/${k}/cast.json`, "utf8")), { restaurant } = JSON.parse(fs.readFileSync(`${kits}/${k}/menu.json`, "utf8"));
    return people.map((p) => ({ ...p, where: restaurant, file: `${kits}/${k}/cast/${p.name}.jpg` })).filter((p) => fs.existsSync(p.file));
  });
}

// His words, for every face: real skin, no retouching, so they never look cinematic or fake.
const SKIN = { man: "skin shows natural texture — visible pores, slight uneven tone, a bit of stubble — no retouching.", woman: "skin shows natural texture — visible pores, slight uneven tone, fine facial hair in the light — no retouching." };
const real = (p) => `${p.age}-year-old ${p.sex}, ${p.look}, healthy complete natural teeth. Their ${SKIN[p.sex]}`;
// Where the logo goes: small, high on the chest, on the right of the photo (their left chest), like a brand's chest logo.
const LOGO = "printed small, about the size of a palm, high on the chest on the right side of the photo (their left chest), like a clothing brand's chest logo; nothing else printed on the shirt";
const dressed = (p) => (p.outfit === "house tee" ? `They wear ${p.wears}; the tee has exactly the logo of image 1 ${LOGO}.` : `They wear their own everyday clothes: ${p.wears}. No logos or text on their clothes.`);

export async function castFor(dir, n = 4) {
  const file = `${dir}/cast.json`;
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const menu = JSON.parse(fs.readFileSync(`${dir}/menu.json`, "utf8")), food = menu.items.slice(0, 4).map((m) => fs.readFileSync(`${dir}/${m.photo}`));
  const cast = await ask([
    { type: "input_text", text: PROMPT.replace("{R}", `${menu.restaurant} (${menu.cuisine})`).replace("{CITY}", menu.city || "its city").replace("{N}", n).replace("{UNIQUE}", UNIQUE).replace("{TAKEN}", taken(castElsewhere(dir))) },
    await img(await logoJpg(dir)), ...(await Promise.all(food.map(img))),
  ], "cast", CAST);
  fs.writeFileSync(file, JSON.stringify(cast, null, 2) + "\n");
  return cast;
}

// The logo flattened on white: the image model reads a transparent PNG as a black square.
const logoJpg = (dir) => sharp(`${dir}/logo.png`).flatten({ background: "#ffffff" }).resize(768, 768, { fit: "contain", background: "#ffffff" }).jpeg({ quality: 95 }).toBuffer();

// A new image from words alone, for the cast in their own clothes (no logo to show the model).
async function museMake(prompt) {
  const res = await fetch("https://api.meta.ai/v1/images/generations", {
    method: "POST", headers: { Authorization: `Bearer ${process.env.META_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "muse-image-1.0", prompt, size: `${W}x${H}`, output_format: "jpeg", n: 1 }),
  });
  if (!res.ok) throw new Error(`muse-image ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return sharp(Buffer.from((await res.json()).data[0].b64_json, "base64")).resize(W, H, { fit: "cover" }).jpeg({ quality: 92 }).toBuffer();
}

const PORTRAIT_CHECK = {
  type: "object", additionalProperties: false, required: ["ok", "problems"],
  properties: { ok: { type: "boolean" }, problems: { type: "array", items: { type: "string" } } },
};

// Muse's look at a portrait: age, teeth, grooming, the logo, and no other brand or text anywhere.
export async function checkPortrait(dir, p, out) {
  const tee = p.outfit === "house tee", logo = tee ? await logoJpg(dir) : null;
  return ask([
    { type: "input_text", text: `Image 1 is a portrait drawn for a restaurant's house cast: ${real(p)} ${dressed(p)}${tee ? " Image 2 is the restaurant's logo." : ""}
It passes only if: they look 23 to 25; the teeth are complete and healthy; they look well groomed and good-looking the way real people are, not model-perfect; it reads as an unretouched phone photo of a normal person, nothing a viewer would suspect is AI (no plastic or airbrushed skin, no perfect symmetry, no glassy eyes, no too-perfect teeth or hair); ${tee ? "the logo is the one in image 2, small, high on the chest, on the right of the photo" : "the clothes carry no logo or text"}; and nothing else shows a brand, a team or text.` },
    await img(out), ...(tee ? [await img(logo)] : []),
  ], "portrait_check", PORTRAIT_CHECK);
}

// Head and shoulders of a portrait, so faces are compared at the same size.
// One resize per sharp pipeline: a second one replaces the first, so each step is its own buffer.
const head = async (src, T = 256) => sharp(await sharp(src).resize(W, H, { fit: "cover" }).toBuffer()).extract({ left: 0, top: Math.round(H * 0.04), width: W, height: W }).resize(T, T).jpeg({ quality: 90 }).toBuffer();

// The faces a portrait must not repeat, on one numbered sheet, left to right.
async function faceSheet(people) {
  const T = 256, cols = Math.min(4, people.length), num = (i) => Buffer.from(`<svg width="48" height="40"><rect width="48" height="40" fill="#000"/><text x="24" y="29" font-size="26" font-family="Arial" fill="#fff" text-anchor="middle">${i + 1}</text></svg>`);
  const tiles = await Promise.all(people.map(async (p, i) => ({
    input: await sharp(await head(p.file, T)).composite([{ input: num(i), left: 0, top: 0 }]).jpeg().toBuffer(),
    left: (i % cols) * T, top: Math.floor(i / cols) * T,
  })));
  return sharp({ create: { width: cols * T, height: Math.ceil(people.length / cols) * T, channels: 3, background: "#ffffff" } }).composite(tiles).jpeg({ quality: 90 }).toBuffer();
}

const SAME = {
  type: "object", additionalProperties: false, required: ["same", "why"],
  properties: { same: { type: "array", items: { type: "integer" }, description: "The numbers on image 2 of anyone image 1 could pass for; empty if none." }, why: { type: "string" } },
};

// Muse's look across casts: would a viewer think the new face is someone already cast here or at another restaurant?
export async function lookalikes(face, others) {
  if (!others.length) return [];
  const r = await ask([
    { type: "input_text", text: `Image 1 is a new face for a restaurant's house cast. Image 2 shows, numbered, people already cast for this restaurant or others. Each one must be clearly someone else. Would a viewer who saw both on Instagram think image 1 is any of them, or their brother or sister? Compare the face itself: face shape, eyes, nose, mouth, jaw, hairline, hair and facial hair. Sharing a background or a skin tone is fine; a face built the same way is not. The image model tends to draw one default face for each kind of person, so be strict.` },
    await img(await head(face)), await img(await faceSheet(others)),
  ], "lookalike", SAME);
  return r.same.map((k) => others[k - 1]).filter(Boolean);
}

// One new person in place of one who repeats a face or a name: same sex, outfit and place in the area's mix, a new face.
export async function recast(dir, cast, p, others, why) {
  const { restaurant, city } = JSON.parse(fs.readFileSync(`${dir}/menu.json`, "utf8"));
  return ask([
    { type: "input_text", text: `The house cast of ${restaurant} in ${city} needs a new ${p.sex} aged 23 to 25 in place of ${p.name} (${p.look}), because ${why}. The area: ${cast.area} Keep their place in that mix and their outfit (${p.outfit}${p.outfit === "house tee" ? `, a tee of a color no one else in this cast wears: ${cast.people.filter((x) => x !== p).map((x) => x.wears).join("; ")}` : ""}). Well groomed, clean, hair done, healthy complete teeth, never model-perfect.
Image 1 shows, numbered, the ${p.sex === "woman" ? "women" : "men"} already cast here and at other restaurants. The new one must be someone a viewer could never mistake for any of them, with a face shape and a hairstyle nobody in image 1 has. ${UNIQUE}${taken(others)}` },
    ...(others.some((o) => o.sex === p.sex) ? [await img(await faceSheet(others.filter((o) => o.sex === p.sex)))] : []),
  ], "person", CAST.properties.people.items);
}

// Up to three drawings; the first that passes Muse's look is kept, else the last one, returned with its problems.
// `others`: people already cast (here and elsewhere) whose faces this one must not repeat.
export async function portrait(dir, cast, p, others = []) {
  const file = `${dir}/cast/${p.name}.jpg`;
  if (fs.existsSync(file)) return { out: fs.readFileSync(file), ok: true, problems: [] };
  fs.mkdirSync(`${dir}/cast`, { recursive: true });
  const logo = await logoJpg(dir), tee = p.outfit === "house tee";
  let out, check = { problems: [] };
  for (let k = 0; k < 3; k++) {
    // A quiet residential street: storefronts behind them kept putting signs and text in the shot.
    const prompt = `A candid vertical phone photo of a ${real(p)} ${dressed(p)} Standing on a quiet tree-lined residential street with no shops, signs or text in view, waist up, facing the camera with a relaxed natural smile, daylight from the side. Taken by a friend at eye level from about two meters with the phone's normal 1x lens, no wide-angle distortion. Shot on an iPhone, slightly imperfect framing, true colors, no studio light, no shallow-focus glamour, not cinematic. No other text or logos anywhere.${check.problems.length ? ` Fix: ${check.problems.join("; ")}.` : ""}`;
    out = tee ? await museEdit(prompt, logo) : await museMake(prompt);
    check = await checkPortrait(dir, p, out);
    const same = check.ok ? await lookalikes(out, others.filter((o) => o.sex === p.sex)) : [];
    if (same.length) check = { ok: false, problems: [`the face came out too close to ${same.map((o) => `${o.name} of ${o.where}`).join(" and ")}: a clearly different face shape, features and hairstyle`] };
    console.log(`  ${p.name}: ${check.ok ? "ok" : check.problems.join("; ")}`);
    if (check.ok) break;
  }
  fs.writeFileSync(file, out);
  return { out, ...check };
}

// One or two of the cast with the real dish, as models: they hold it, show it, carry it. Nobody eats, unless
// `bite` (the bite test): then the frame is the instant before the first bite, the food still whole.
// The image model keeps their faces and clothes from the portraits and the food from the restaurant's own photo.
// `where` is never the restaurant's own room: that place is real, so it only comes from the owner's photos.
const who = (people) => people.map((p, i) => `image ${i + 1} (${real(p)})`).join(" and ");
export async function guestFrame(faces, dishJpg, people, dish, where, moment = "holding it toward the camera with a natural smile, like showing a friend what they ordered", bite = false) {
  const n = people.length, d = n + 1;
  return museEdit(`${n > 1 ? "The same people as" : "The same person as"} ${who(people)}: same faces, same hair, same clothes. ${where} With ${dish} from image ${d}, exactly as it looks there: same food, same colors, same size. The moment: ${moment}. ${bite ? "Nobody has bitten yet: the food is whole and the mouth is closed." : "Nobody is eating."} A candid vertical phone photo, natural light, true colors, not cinematic, nothing retouched. No signs, storefronts, menus or text anywhere; the only logo is the one already on a shirt.`, [...faces, dishJpg]);
}

const GUEST_CHECK = {
  type: "object", additionalProperties: false, required: ["matches", "score", "problems", "motion"],
  properties: {
    matches: { type: "boolean" },
    score: { type: "integer", description: "0-10: how much it reads as a real phone photo of these people with this real food." },
    problems: { type: "array", items: { type: "string" } },
    motion: { type: "string", description: "Video prompt for the 4 s clip that starts on the drawn frame: the camera, what each person does in order, and what never changes." },
  },
};

// What the person does in the clip. A model shows the food; the bite test takes one real bite.
const MODEL_MOTION = "a small turn toward the camera, lifting the food into the light, a look at it, a natural smile or a laugh between friends. Nobody bites, eats or chews.";
const BITE_MOTION = "one natural bite from the front edge, the bite mark showing the real filling of this dish, chewing with the mouth closed, a small honest reaction (a nod, eyes up for a second), never an exaggerated face. Teeth stay complete and natural.";

// Muse checks the guest frame before any video is paid for, and writes the clip's motion.
// `how` is what the person does in the clip, in plain words; `bite` lets the clip, never the frame, show a bite.
export async function checkGuest(faces, dishJpg, frame, people, action, { how = MODEL_MOTION, bite = false } = {}) {
  const n = people.length, d = n + 1, f = n + 2;
  return ask([
    { type: "input_text", text: `${who(people)} ${n > 1 ? "are" : "is"} the house cast of a restaurant, its models. Image ${d} is the restaurant's real dish. Image ${f} is the drawn first frame of a 4 s clip: ${action}
It matches only if: the same ${n > 1 ? "people" : "person"} (face, hair, build, the same clothes and any logo on them); the food is the real dish of image ${d} (same filling, color, size, shape, nothing extra); hands have five fingers and hold the food the way people do; ${bite ? "the food is still whole, nobody has bitten yet" : "nobody is eating"}; it reads as an unretouched phone photo of normal people, not a styled ad and nothing a viewer would suspect is AI; and no sign, wall logo, storefront or menu shows the restaurant's name (that would be a made-up version of its real place: fail). Small differences of light are fine.
Then write the motion for the clip as it happens on a real phone video: ${bite ? BITE_MOTION : how} Handheld phone, slight sway. Faces, clothes, logos and the food stay exactly as they are${bite ? ", except the one bite" : ""}, no morphing.` },
    ...(await Promise.all([...faces, dishJpg, frame].map(img))),
  ], "guest_check", GUEST_CHECK);
}
