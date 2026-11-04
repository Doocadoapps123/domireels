// Lab: send a finished run back to the restaurant's platform as a draft for the owner.
// Usage: node --env-file=../.env lab/drop.mjs <run dir> <kit dir> [--force]   (--force: send even if Muse did not approve it)
import { deliver } from "../src/drop.mjs";

const [dir, menuDir] = process.argv.slice(2), r = await deliver({ dir, menuDir, force: process.argv.includes("--force") });
if (r.stop === "review") console.log(`Muse did not approve this Reel, nothing sent:\n${r.problems.map((x) => `- ${x}`).join("\n")}`);
else console.log(`${r.video}\n${r.cover}\n\nmessage for the owner:\n${r.owner_message}`);
