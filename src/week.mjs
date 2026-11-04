// The look and sound of each restaurant's Reels this week. Which Reel each one makes is no longer drawn from a list of
// kinds: Muse invents the ideas (src/ideas.mjs, src/trends.mjs) and lab/friday.mjs keeps them apart.
// 100 restaurants never all get trap in the same week. Each
// restaurant gets a few music registers and text styles nobody else has this week (while there are enough) and none of
// its own last 3 Reels had; Muse picks the one that fits its food.
export const MUSIC = [
  "dembow", "latin trap", "old-school reggaeton", "merengue típico (perico ripiao)", "modern bachata guitar", "salsa dura",
  "digital cumbia", "afrobeats", "amapiano", "nu-disco funk", "lo-fi hip hop", "90s boom bap", "jersey club", "Brazilian funk",
  "soulful house", "drift phonk", "neo-soul R&B", "acoustic guitar with hand claps", "bossa nova", "swing jazz trio", "surf rock",
  "happy ukulele and whistle", "chiptune", "corridos tumbados guitars", "kompa", "dancehall", "city pop",
  "no music: only the kitchen sound, up front",
];
// The app's typewriter font disappears on light tables (src/overlay.mjs test, 3 Nov), so it is not drawn.
export const TEXT = ["classic", "box", "box-light", "meme", "none"];
export function weekStyles(restaurants, history, { music = [], text = [] } = {}) {
  const takenM = new Set(music), takenT = new Set(text), plan = {};
  const pick = (list, taken, recent, k) => {
    const fresh = list.filter((x) => !recent.has(x)), free = fresh.filter((x) => !taken.has(x));
    return [...(free.length >= k ? free : fresh)].sort(() => Math.random() - 0.5).slice(0, k);
  };
  for (const r of [...restaurants].sort(() => Math.random() - 0.5)) {
    const mine = history.filter((h) => h.restaurant.split(" (")[0] === r.name).slice(-3);
    const m = pick(MUSIC, takenM, new Set(mine.map((h) => h.music).filter(Boolean)), 5), t = pick(TEXT, takenT, new Set(mine.map((h) => h.text).filter(Boolean)), 2);
    m.forEach((x) => takenM.add(x));
    t.forEach((x) => takenT.add(x));
    plan[r.kit] = { music: m, text: t };
  }
  return plan;
}
