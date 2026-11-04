// Lab: nobody repeats across restaurants, not a face and not a name. Each kit, in the order given, is compared
// with every cast as it stands now; a person whose name is taken or whose face Muse finds in another cast is
// replaced by a new one (recast: same sex, outfit and place in the area's mix) and drawn again. The old portrait
// is set aside in old/. The last kit keeps its people, so put the restaurant where a look fits best last.
// --keep=a,b: people never replaced (the ones the others must not look like).
// --redo=a,b: replace only these (a portrait someone rejected), everyone else stays.
// Usage: node --env-file=../.env lab/unique.mjs <kit dir>... [--keep=name,name] [--redo=name,name]
import fs from "node:fs";
import { castElsewhere, lookalikes, recast, portrait } from "../src/cast.mjs";

const list = (flag) => (process.argv.find((a) => a.startsWith(`--${flag}=`)) ?? "").split("=")[1]?.split(",") ?? [];
const keep = list("keep"), redo = list("redo");
for (const dir of process.argv.slice(2).filter((a) => !a.startsWith("--"))) {
  const file = `${dir}/cast.json`, cast = JSON.parse(fs.readFileSync(file, "utf8")), { restaurant } = JSON.parse(fs.readFileSync(`${dir}/menu.json`, "utf8"));
  for (const [i, p] of cast.people.entries()) {
    const others = [...castElsewhere(dir), ...cast.people.filter((x) => x !== p).map((x) => ({ ...x, where: restaurant, file: `${dir}/cast/${x.name}.jpg` }))];
    if (keep.includes(p.name) || (redo.length && !redo.includes(p.name))) { console.log(`${restaurant} ${p.name}: kept`); continue; }
    const twin = others.find((o) => o.name === p.name);
    const same = twin || redo.length ? [] : await lookalikes(fs.readFileSync(`${dir}/cast/${p.name}.jpg`), others.filter((o) => o.sex === p.sex));
    if (!redo.length && !twin && !same.length) { console.log(`${restaurant} ${p.name}: own face`); continue; }
    let why = redo.length ? "their portrait was rejected on review: too close to someone already cast, or off for the area" : twin ? `the name ${p.name} is already used at ${twin.where}` : `their face looks like ${same.map((o) => `${o.name} of ${o.where}`).join(" and ")}`;
    console.log(`${restaurant} ${p.name}: ${why}`);
    for (let k = 0; k < 2; k++) {
      const q = await recast(dir, cast, p, others, why);
      if (others.some((o) => o.name === q.name) || q.name === p.name) { why = `the name ${q.name} is already used`; continue; }
      // Kept only when the portrait passed Muse's whole look (age, teeth, logo, and no face already cast).
      const drawn = await portrait(dir, cast, q, others);
      console.log(`  -> ${q.name}: ${q.look}${drawn.ok ? "" : ` (failed: ${drawn.problems.join("; ")})`}`);
      if (!drawn.ok && k === 0) { fs.mkdirSync(`${dir}/old/cast-v3`, { recursive: true }); fs.renameSync(`${dir}/cast/${q.name}.jpg`, `${dir}/old/cast-v3/${q.name}.jpg`); why = `the first new person failed: ${drawn.problems.join("; ")}`; continue; }
      fs.mkdirSync(`${dir}/old/cast-v3`, { recursive: true });
      fs.renameSync(`${dir}/cast/${p.name}.jpg`, `${dir}/old/cast-v3/${p.name}.jpg`);
      cast.people[i] = q;
      fs.writeFileSync(file, JSON.stringify(cast, null, 2) + "\n");
      break;
    }
  }
}
