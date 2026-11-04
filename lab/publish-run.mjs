// Lab: publish a finished run of a job whose Reel was made but not stored (it failed after Muse approved it), without
// making it again. Usage: node --env-file=../.env lab/publish-run.mjs <job id>
import { db, must } from "../src/server/db.mjs";
import { kitDir } from "../src/server/kits.mjs";
import { publish } from "../src/server/worker.mjs";

const [job] = await must(db.from("jobs").select("*, restaurants(*, accounts(*))").eq("id", process.argv[2]));
const r = job.restaurants, account = r.accounts, kit = kitDir(r, account), weekFile = `${kit}/week-${job.week}.json`;
const pick = job.input?.pick ?? 0, dir = `lab/out/auto/${kit.split("/").pop()}-w${job.week}${pick ? `-${pick}` : ""}`;
await publish(job, r, account, kit, dir, weekFile);
await must(db.from("jobs").update({ status: "done", error: null, updated_at: new Date().toISOString() }).eq("id", job.id));
console.log(`published ${dir}`);
