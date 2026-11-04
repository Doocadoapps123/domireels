// Lab: puts a Reel in the worker's queue for a restaurant, to be delivered as soon as it is made.
// Usage: node --env-file=../.env lab/queue.mjs <restaurant id> [spend cap, default 8]
import { db, must } from "../src/server/db.mjs";
const [rid, cap = "8"] = process.argv.slice(2);
const week = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const [j] = await must(db.from("jobs").insert({ restaurant_id: rid, kind: "reel", week, spend_cap: +cap, input: { pick: 0, now: true, gallery: true } }).select("id, week"));
console.log(j);
