// Lab: grow the stock library. Usage: node --env-file=../.env lab/stock.mjs [clips per tag] [Mixkit tag ...]
import { grow } from "../src/stock.mjs";

const QUERIES = ["oil", "grill", "barbecue", "fire", "flame", "flames", "oven", "pizza", "steam", "smoke", "kitchen", "chef", "cooking",
  "knife", "neon", "city-night", "restaurant", "delivery"];
const [per = "6", ...queries] = process.argv.slice(2);
const lib = await grow(queries.length ? queries : QUERIES, { per: +per });
console.log(`library: ${lib.length} clips`);
