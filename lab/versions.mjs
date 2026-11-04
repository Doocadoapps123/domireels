// Lab and server: the same Reel with other scores, so an owner who deals with Domi Reels directly picks the music
// (the one they pick teaches Muse their taste). Each extra score is in a register this restaurant has this week and no
// other restaurant does (src/week.mjs); Muse writes it for this Reel. Only music is paid for (~$0.13 a take).
// Usage: node --env-file=../.env lab/versions.mjs <run dir> <week file> [how many in all, default 3]
//   -> <run dir>/versions/<n>.mp4 and versions.json [{ register, prompt, file }], the first one the Reel as it is.
import fs from "node:fs";
import { ask, loadCraft } from "../src/director.mjs";
import { music, render } from "../src/edit.mjs";
import { overlay } from "../src/overlay.mjs";

const [dir, week, n = "3"] = process.argv.slice(2), file = `${dir}/script.json`;
const script = JSON.parse(fs.readFileSync(file, "utf8")), original = JSON.stringify(script, null, 2) + "\n";
const look = (JSON.parse(fs.readFileSync(week, "utf8"))[0].look?.music || []).filter((r) => r !== script.music?.register);
fs.mkdirSync(`${dir}/versions`, { recursive: true });
const out = [{ register: script.music?.register || "", prompt: script.music?.prompt || "", file: `${dir}/versions/0.mp4` }];
fs.copyFileSync(`${dir}/final.mp4`, out[0].file);

const { scores } = await ask([{ type: "input_text", text: `How Domi makes Reels, with the music owners liked and did not:
${loadCraft()}

A restaurant's Reel: "${script.concept}". ${script.owner_summary || ""}
Its music now: ${script.music?.register}: "${script.music?.prompt}".
The owner will choose between that and ${+n - 1} other scores for the same cut. Pick ${+n - 1} registers from these (none of them is another restaurant's this week): ${look.join("; ") || "any that fits the food"}.
Make them really different from each other and from the current one, each one a register that fits this food and this idea. For each, the prompt for an instrumental music model: genre, instruments, tempo, mood, how it moves under this Reel. Play each genre the way it is really played, at its real tempo, with its own instruments. It must carry on a phone speaker: the genre's own lead on top, not only drums and bass.` }],
  "versions", { type: "object", additionalProperties: false, required: ["scores"], properties: { scores: { type: "array", items: { type: "object", additionalProperties: false, required: ["register", "prompt"], properties: { register: { type: "string" }, prompt: { type: "string" } } } } } });

const keep = `${dir}/versions/.keep`;
fs.mkdirSync(keep, { recursive: true });
const ours = () => fs.readdirSync(dir).filter((x) => /^(music|mix-)/.test(x));
for (const x of ours()) fs.renameSync(`${dir}/${x}`, `${keep}/${x}`);
try {
  for (const [i, s] of scores.slice(0, +n - 1).entries()) {
    const v = { ...script, music: { ...script.music, register: s.register, prompt: s.prompt, by: "muse", owner: undefined } };
    delete v.music.options;
    fs.writeFileSync(file, JSON.stringify(v, null, 2) + "\n");
    await music(v, dir);
    const r = await render(v, dir), to = `${dir}/versions/${i + 1}.mp4`;
    if (v.texts_at?.length && v.text_style !== "none") await overlay(r.file, v.texts_at.map((x) => ({ ...x, style: v.text_style, pos: "top" })), to);
    else fs.renameSync(r.file, to);
    out.push({ register: s.register, prompt: s.prompt, file: to });
    for (const x of ours()) fs.renameSync(`${dir}/${x}`, `${dir}/versions/${i + 1}-${x}`);
    console.log(`${to}: ${s.register}`);
  }
} finally {
  for (const x of ours()) fs.rmSync(`${dir}/${x}`);
  for (const x of fs.readdirSync(keep)) fs.renameSync(`${keep}/${x}`, `${dir}/${x}`);
  fs.rmSync(keep, { recursive: true });
  fs.writeFileSync(file, original);
  fs.copyFileSync(out[0].file, `${dir}/final.mp4`);
}
fs.writeFileSync(`${dir}/versions.json`, JSON.stringify(out, null, 2) + "\n");
console.log(`RESULT ${JSON.stringify(out)}`);
