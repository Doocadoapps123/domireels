// How Muse thinks up a week's Reels. Yansel, 4 Nov: "se supone que muse busque o cree su propia idea ... en los reels
// tenemos ideas con letras, ideas de reels con varios platos, con un plato cocinando y armando, probando (se supone que
// tenemos avatars), hay muchas cosas que hacer". Until then Muse picked from 12 fixed kinds (data/families.json): a
// template with another name. Now Muse invents every idea from what is working this week (src/trends.mjs), what this
// restaurant has, and what it has made before. The families stay as examples of what worked, never as a menu.
//
// Each idea is described by four axes so variety can be measured without a template: who tells it, the moment, how
// many dishes and the hook. Its "combo" (who tells it / moment / dishes) is what the viewer recognizes as the same Reel.
// Variety, Yansel's rule: with a few restaurants no two share a combo in a week; with 100 restaurants combos repeat,
// spread evenly, each made with that restaurant's own photos. A restaurant never repeats its own last 3 combos.
import fs from "node:fs";

export const AXES = {
  voice: {
    letters: { es: "letras", en: "The text on screen carries the story: a line people want to read to the end or send to a friend (a POV they live, a joke, a confession, a hot take, a local truth, a price that surprises), not a label on each dish. The pictures are the restaurant's real photos brought alive in the edit (push-ins, punch-ins to the best detail, cuts on the beat) plus at most two hand shots on the real dish for the payoff, so the food stays the real photo. A countdown or a list of photos with numbers on them is photos passing by, not a Reel (Muse's own judge, 4 Nov)." },
    hands: { es: "manos", en: "Hands act on the real dish the way people really eat or handle it (lift, dip, break, pull, build), drawn by the video model from the real photo." },
    avatar: { es: "avatar", en: "A member of this restaurant's house cast holds or shows the real dish, the box or the bag, or reacts almost still. Never eating, walking or talking." },
    owner_voice: { es: "voz del dueño", en: "The owner's own voice note plays over the food." },
  },
  moment: {
    cooking: { es: "se cocina o se arma", en: "the dish is cooked or built" },
    reveal: { es: "se revela", en: "the dish is revealed or appears" },
    tasting: { es: "se prueba", en: "the first bite or the taste, without showing anyone eating" },
    occasion: { es: "una ocasión", en: "an occasion: a series night, the office lunch, Sunday with family, game day, a holiday" },
    place: { es: "el lugar", en: "the place: the counter, the kitchen, the line, the storefront" },
  },
  dishes: {
    one: { es: "un plato", en: "one dish" },
    several: { es: "varios platos", en: "several dishes" },
    menu: { es: "el menú", en: "the menu as a whole" },
  },
  hook: {
    craving: { es: "antojo", en: "pure craving: the hungriest second first" },
    pov: { es: "POV", en: "a POV line the viewer lives" },
    price: { es: "precio", en: "the price or the value" },
    ranking: { es: "ranking o lista", en: "a ranking or a list" },
    question: { es: "pregunta", en: "a question or a challenge to the viewer" },
    trend: { es: "tendencia", en: "a format or a sound that is working this week" },
    local: { es: "local", en: "the city, the neighborhood, where people come from" },
    season: { es: "temporada", en: "the date: a holiday, the weather, a game" },
  },
};

// How a Reel is filmed. Yansel, 4 Nov: "trato de entender por qué siempre nos vamos con 1 estilo". The judge rewarded
// the safest way to film (a hand on the real dish passes most often), the plan forced 6-9 hand shots on every idea, and
// every Reel came out the same. The style is now what is handed out: each restaurant rotates, and in one week no two
// share one. Muse invents the idea inside it, and may open a style that is not here ("new").
export const STYLES = {
  close: { es: "de cerca", en: "Up close: hands act on the real dish the way people eat it (lift, dip, break, pull), the camera still and close.", plan: "5-9 video shots on the real dishes, at most 2 stills." },
  making: { es: "elaboración", en: "The dish being made where it is really made: the restaurant's real food on its real equipment (the basket lifted out of the fryer dripping, the meat on the plancha, the tray out of the oven), then the plated real dish. Only for a dish that is cooked on equipment this restaurant has a frame of.", plan: "4-8 video shots; at least one starts from an equipment frame with this restaurant's food on it." },
  table: { es: "mesa documental", en: "Several dishes together on one table: the camera passes over all of them like a documentary (made in the edit from the real photos), then each dish gets its own moment.", plan: "One spread shot, then 3-7 video shots across the dishes." },
  letters: { es: "contado con letras", en: "The on-screen text carries the story: a POV, a confession, a this-or-that, a local truth, a line people want to finish or send. The real photos brought alive in the edit, and 1-4 hand shots for the payoff. A list of photos with labels is not this.", plan: "1-4 video shots, up to 6 stills, up to 5 text lines held long enough to read." },
  place: { es: "el local", en: "The restaurant's own place (its storefront, counter, display case) from its own photos, and its food: the place where this food is.", plan: "2-4 of its own place photos as stills, then 3-7 video shots of the dishes." },
  avatar: { es: "avatar", en: "A member of this restaurant's house cast holds or shows the real dish, the box or the bag, or reacts almost still. Never eating, walking or talking.", plan: "Guest shots of the house cast with the real dish, and video shots of the food." },
};
// A style a restaurant cannot make this week is not offered: no making for a cheesecake (Yansel, 4 Nov), no table
// without two good photos, no place without its own place photos.
export function stylesFor(dir, inv, own = [], stock = []) {
  const good = inv.filter((d) => d.score >= 7);
  const kit = own.filter((a) => a.base).length + stock.filter((x) => x.base && !x.own).length;
  const cooked = good.some((d) => !["none", "cold"].includes(d.station));
  const places = own.filter((a) => !a.base).length;
  return Object.keys(STYLES).filter((k) =>
    k === "close" ? good.length >= 1
    : k === "making" ? cooked && kit > 0
    : k === "table" ? good.length >= 2
    : k === "letters" ? good.length >= 3
    : k === "place" ? places >= 2
    : k === "avatar" ? false // off camera until the cast passes a test that costs no video (1 Nov: "la persona se ve ai 100%")
    : false);
}

export const comboOf = (a) => (!a ? "" : a.style === "new" ? `new: ${(a.new_style || "").split(/[:.,]/)[0].trim().toLowerCase()}` : a.style || `${a.voice}/${a.moment}/${a.dishes}`);
export const comboText = (combo) => {
  if (STYLES[combo] || combo.startsWith("new")) return STYLES[combo]?.es || combo;
  const [v, m, d] = combo.split("/");
  return `${AXES.voice[v]?.es || v} / ${AXES.moment[m]?.es || m} / ${AXES.dishes[d]?.es || d}`;
};

// The voices this restaurant can use: hands need a dish photo that carries a Reel; letters need a few good photos;
// an avatar needs its house cast (src/cast.mjs, cast.json); the owner's voice needs a voice note from the owner.
export function voicesFor(dir, inv) { // before styles (4 Nov); kept for old week files
  const good = inv.filter((d) => d.score >= 7).length;
  return Object.keys(AXES.voice).filter((v) =>
    v === "hands" ? good >= 1
    : v === "letters" ? good >= 3
    : v === "avatar" ? fs.existsSync(`${dir}/cast.json`)
    : v === "owner_voice" ? fs.existsSync(`${dir}/voice`) && fs.readdirSync(`${dir}/voice`).length > 0
    : false);
}

// How many restaurants may share one style this week: one while there are more styles than restaurants, then as even
// as it gets (100 restaurants over 6 styles: 17 each at most, each with its own photos and its own idea).
export function comboLimit(restaurants, styles = Object.keys(STYLES).filter((k) => k !== "avatar").length) {
  return Math.max(1, Math.ceil(restaurants / styles));
}

// The style of a Reel in the history: before 4 Nov the combo was who told it / moment / dishes, and every Reel told by
// hands was filmed up close.
export const styleOfCombo = (c) => (STYLES[c] || String(c).startsWith("new") ? c : { hands: "close", letters: "letters", avatar: "avatar", owner_voice: "close" }[String(c).split("/")[0]] || "close");
// The styles of this restaurant's last 2 Reels: not again so soon.
export const recentCombos = (history, restaurant, n = 2) =>
  history.filter((h) => h.restaurant.split(" (")[0] === restaurant && h.combo).slice(-n).map((h) => styleOfCombo(h.combo));

// What came out so far by who tells the Reel, measured on finished Reels (history) and Muse's last look: an idea leans
// on what works more often, never only on it (Yansel, 2 Nov).
export function voiceRecord(history) {
  const out = {};
  for (const h of history.filter((x) => x.combo)) {
    const v = styleOfCombo(h.combo);
    (out[v] ||= { made: 0, approved: 0 }).made++;
    if (h.approved) out[v].approved++;
  }
  return out;
}

// The axes as the pitch reads them: the styles this restaurant can make, then the rest of the idea.
export function axesText({ styles, record = {} }) {
  const v = styles.map((k) => `  - ${k}: ${STYLES[k].en}${record[k] ? ` (${record[k].approved} of ${record[k].made} Reels in this style passed your last look so far)` : ""}`);
  return [
    "The style, how it is filmed (only these: this restaurant has what they need). Or a new style of your own (style \"new\"), if our camera can make it: say how in its format.", ...v,
    "The moment:", ...Object.entries(AXES.moment).map(([k, x]) => `  - ${k}: ${x.en}`),
    "How many dishes:", ...Object.entries(AXES.dishes).map(([k, x]) => `  - ${k}: ${x.en}`),
    "The hook:", ...Object.entries(AXES.hook).map(([k, x]) => `  - ${k}: ${x.en}`),
  ].filter(Boolean).join("\n");
}

// The families of the owner's reference Reels, as examples of ideas that worked: one line each.
export function examplesText(file = "data/families.json") {
  if (!fs.existsSync(file)) return "";
  return JSON.parse(fs.readFileSync(file, "utf8")).map((f) => `- ${f.es_name}: ${f.core}`).join("\n");
}

// An idea is worth making when Muse's judge expects it to come out and it repeats nothing.
export const REALISM_MIN = 6;
export const worthMaking = (c) => (c.muse?.realism ?? 0) >= REALISM_MIN && !c.muse?.repeats && (c.muse?.photos ?? 10) >= 6;
