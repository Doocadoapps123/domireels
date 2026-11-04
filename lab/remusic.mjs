// Lab: the owner heard a Reel and the music does not work. Muse writes the music again from the owner's own words, inside
// the registers this restaurant has this week, and the Reel is mixed and texted again. No video is paid for.
// Usage: node --env-file=../.env lab/remusic.mjs <run dir> <week file> "<what the owner said>"
import fs from "node:fs";
import { ask, loadCraft } from "../src/director.mjs";
import { music, render } from "../src/edit.mjs";
import { overlay } from "../src/overlay.mjs";

const [dir, week, said] = process.argv.slice(2), file = `${dir}/script.json`, script = JSON.parse(fs.readFileSync(file, "utf8"));
const look = JSON.parse(fs.readFileSync(week, "utf8"))[0].look?.music || [];
const r = await ask([{ type: "input_text", text: `How Domi makes Reels, with the music the owner liked and did not:
${loadCraft()}

You scored a restaurant's Reel: "${script.concept}". Your music: ${script.music.register}: "${script.music.prompt}".${script.music.owner ? `\nThat music already answered the owner's earlier words: "${script.music.owner}"` : ""}
The owner watched it and said: "${said}"
Write the music again so it answers the owner. When the owner names a genre, that is the register: the owner's word beats the week's plan. Otherwise pick one from these, which no other restaurant has this week: ${look.join("; ") || "any"}. Then the prompt for an instrumental music model: genre, instruments, tempo, mood, how it moves under this Reel. Play the genre the way it is really played, at its real tempo, with its own instruments. It must carry on a phone speaker: a melody or lead on top, not only drums and bass.` }],
  "music", { type: "object", additionalProperties: false, required: ["register", "prompt", "why"], properties: { register: { type: "string" }, prompt: { type: "string" }, why: { type: "string" } } });
console.log(JSON.stringify(r, null, 2));
fs.mkdirSync(`${dir}/old`, { recursive: true });
for (const x of fs.readdirSync(dir).filter((x) => /^music/.test(x))) fs.renameSync(`${dir}/${x}`, `${dir}/old/${Date.now()}-${x}`);
script.music = { ...script.music, register: r.register, prompt: r.prompt, owner: said };
fs.writeFileSync(file, JSON.stringify(script, null, 2) + "\n");
await music(script, dir);
const out = await render(script, dir);
if (script.texts_at?.length && script.text_style !== "none") {
  fs.renameSync(out.file, `${dir}/final-notext.mp4`);
  await overlay(`${dir}/final-notext.mp4`, script.texts_at.map((x) => ({ ...x, style: script.text_style, pos: "top" })), out.file);
}
console.log(out.file);
