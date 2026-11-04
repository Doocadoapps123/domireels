// Lab: the owner's verdict on a run, in their own words, becomes lessons in data/playbook.json.
// Usage: node --env-file=../.env lab/verdict.mjs <run dir> "<what the owner said>"
import fs from "node:fs";
import { learn, addLessons, loadPlaybook } from "../src/director.mjs";
const [dir, said] = process.argv.slice(2);
const json = (f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
// A lab/direct run keeps its concepts and verdict; a lab/auto run keeps Muse's plan.
const concept = fs.existsSync(`${dir}/concepts.json`) ? json("concepts.json")[json("verdict.json").winner] : { title: json("script.json").concept, plan: json("plan.json") };
const reviews = Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith(".review.json") || f.endsWith(".dailies.json")).map((f) => [f, json(f)]));
const playbook = loadPlaybook();
const lessons = await learn(playbook, said, { dish: json("card.json").dish, date: new Date().toISOString().slice(0, 10), concept, muse_reviews: reviews });
addLessons(playbook, lessons);
fs.appendFileSync(`${dir}/owner.jsonl`, JSON.stringify({ at: new Date().toISOString(), said, lessons }) + "\n");
console.log(JSON.stringify(lessons, null, 2));
