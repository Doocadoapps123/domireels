// "Muse busca" (Yansel, 4 Nov). Once a week Muse searches the web for what is working in food Reels right now and what
// the days ahead bring, and every restaurant's ideas start from it. One file a week for everyone (data/trends/<monday>.json),
// with the sources Muse read; it names no restaurant of ours, so nothing about one reaches another.
import fs from "node:fs";
import { ask, research } from "./director.mjs";

const DIR = "data/trends";
export const mondayOf = (date) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };

const TRENDS = {
  type: "object", additionalProperties: false, required: ["formats", "days", "lines"],
  properties: {
    formats: { type: "array", description: "6-10 Reel formats working now for food and small restaurants.", items: { type: "object", additionalProperties: false, required: ["name", "how", "why", "voice", "source"], properties: {
      name: { type: "string", description: "Short English name." },
      how: { type: "string", description: "What the viewer sees, second by second, in one or two English lines." },
      why: { type: "string", description: "Why it works now, in one English line." },
      voice: { type: "string", enum: ["letters", "hands", "avatar", "owner_voice", "other"], description: "Who tells it: on-screen text over real footage, hands on the food, a person holding or reacting, the owner's voice, or other." },
      source: { type: "string", description: "The url it came from, exactly as in the research; empty if none." },
    } } },
    days: { type: "array", description: "What the next 10 days bring that a restaurant Reel can use (holidays, food days, games, weather, local events in these cities), and the big dates of the next 4 weeks.", items: { type: "object", additionalProperties: false, required: ["date", "what", "angle"], properties: {
      date: { type: "string", description: "YYYY-MM-DD, or a range." }, what: { type: "string" }, angle: { type: "string", description: "How a food Reel could use it, in one English line." },
    } } },
    lines: { type: "array", items: { type: "string" }, description: "Up to 8 on-screen line patterns creators use now (\"POV: ...\", \"rating every ... at ...\")." },
  },
};

export async function weekTrends(date = new Date().toISOString().slice(0, 10), cities = []) {
  const monday = mondayOf(date), file = `${DIR}/${monday}.json`;
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const where = cities.length ? cities.join("; ") : "the United States";
  const found = await research(`You research for a studio that makes Instagram and TikTok Reels for small independent restaurants (bakeries, taquerías, empanada and sandwich shops, Caribbean and Latin kitchens) in ${where}. Today is ${date}.
Search the web, recent sources first (the last 60 days):
1. Which Reel formats are working right now for food and for small restaurants: what the viewer sees, the hook, the on-screen text, the sound. Formats a small restaurant can make from its own photos and short clips, not influencer vlogs.
2. What the next 10 days bring that a restaurant Reel can use: holidays, food days, big games, weather, local events in ${where}. And the big dates of the next 4 weeks a restaurant prepares for ahead (Thanksgiving, Black Friday, Christmas orders, a big game).
3. On-screen line patterns creators use now.
Answer in plain English with the url of every source you used.`);
  const t = await ask([{ type: "input_text", text: `Write this research down as data. Keep only what the research says, with its urls exactly as written.\n\n${found.text}\n\nSources: ${found.sources.join(" ")}` }], "trends", TRENDS);
  const out = { week: monday, searched: date, where, searches: found.searches, sources: found.sources, ...t };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  return out;
}

export const trendsText = (t) => !t ? "" : [
  `WHAT IS WORKING IN FOOD REELS THIS WEEK (you searched the web on ${t.searched}; take a format and make it this restaurant's own, never copy it):`,
  ...t.formats.map((f) => `- ${f.name} [${f.voice}]: ${f.how} Why now: ${f.why}`),
  t.days.length ? `THE DAYS AHEAD:\n${t.days.map((d) => `- ${d.date}: ${d.what}. ${d.angle}`).join("\n")}` : "",
  t.lines.length ? `LINES CREATORS TYPE NOW: ${t.lines.join(" | ")}` : "",
].filter(Boolean).join("\n");

// Usage: node --env-file=../.env src/trends.mjs [date] [city; city]
if (process.argv[1]?.endsWith("trends.mjs")) {
  const t = await weekTrends(process.argv[2], (process.argv[3] || "").split(";").map((x) => x.trim()).filter(Boolean));
  console.log(trendsText(t));
}
