// Gemini Omni image-to-video on fal, with a spend ledger and a hard budget cap.
// Drafts run at 360p ($0.03/s); only approved shots are made at full quality.
import fs from "node:fs";

// Published per-second prices (fal: $0.03/s base; our 6 s 1080p clip was billed $0.91).
const RATE = { "360p": 0.03, "720p": 0.10, "1080p": 0.152, "4k": 0.30 };
const uri = (f) => `data:image/jpeg;base64,${fs.readFileSync(f).toString("base64")}`;
// A dropped connection to fal's CDN killed Dora's run after a paid clip was made (2 Nov): calls that only read or
// download try again, up to 5 times.
async function again(call, n = 5) {
  for (let i = 0; ; i++) {
    try { return await call(); } catch (e) { if (i === n - 1) throw e; await new Promise((r) => setTimeout(r, 3000 * (i + 1))); }
  }
}

// scope: only what was made inside one run folder ("lab/out/auto/doocado-22-0/"), so two runs at once each keep their
// own cap. Without it, Balis and Dora started together would have shared one $3.
export function spent(ledger, scope = "") {
  return fs.existsSync(ledger) ? fs.readFileSync(ledger, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    .filter((x) => !scope || (x.out || "").startsWith(scope)).reduce((s, x) => s + x.cost, 0) : 0;
}

export async function omni({ start, prompt, end, out, res = "360p", duration = 4, ledger = "lab/out/ledger.jsonl", budget = +(process.env.BUDGET || 10), scope = "" }) {
  const cost = +(RATE[res] * duration).toFixed(3), before = spent(ledger, scope);
  if (before + cost > budget) throw new Error(`budget: spent $${before.toFixed(2)} + $${cost} > $${budget}`);
  const auth = { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" };
  const input = { image_url: uri(start), prompt, duration, aspect_ratio: "9:16", resolution: res };
  if (end) input.end_image_url = uri(end);
  const q = await fetch("https://queue.fal.run/google/gemini-omni-flash/v1.1/image-to-video", { method: "POST", headers: auth, body: JSON.stringify(input) }).then((r) => r.json());
  if (!q.status_url) throw new Error(JSON.stringify(q).slice(0, 400));
  fs.appendFileSync(ledger, JSON.stringify({ at: new Date().toISOString(), out, res, duration, cost, request: q.request_id }) + "\n");
  for (;;) {
    await new Promise((r) => setTimeout(r, 4000));
    const s = await fetch(q.status_url, { headers: auth }).then((r) => r.json()).catch(() => ({ status: "IN_PROGRESS" }));
    if (s.status === "COMPLETED") break;
    if (s.status !== "IN_QUEUE" && s.status !== "IN_PROGRESS") throw new Error(JSON.stringify(s).slice(0, 400));
  }
  const r = await again(() => fetch(q.response_url, { headers: auth }).then((x) => x.json()));
  if (!r.video) {
    // fal can say COMPLETED and hand back an error (downstream_service_unavailable): no clip, so the
    // ledger takes the charge back. Run the shot again.
    const why = r.detail?.[0]?.type || JSON.stringify(r).slice(0, 120);
    fs.appendFileSync(ledger, JSON.stringify({ at: new Date().toISOString(), out, cost: -cost, request: q.request_id, failed: why }) + "\n");
    throw new Error(`omni failed, no clip: ${why}`);
  }
  fs.writeFileSync(out, await again(async () => Buffer.from(await (await fetch(r.video.url)).arrayBuffer())));
  return { out, cost, total: +(before + cost).toFixed(2) };
}

// fal takes a video by URL only (a data URI is too long): the file goes to fal's own storage first.
async function falUpload(file, type) {
  const { upload_url, file_url } = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
    method: "POST", headers: { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content_type: type, file_name: file.split("/").pop() }) }).then((r) => r.json());
  const put = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": type }, body: fs.readFileSync(file) });
  if (!put.ok) throw new Error(`fal upload ${put.status}`);
  return file_url;
}

// A clip Muse approved, made sharp: Topaz Proteus on fal triples the 360p draft to 1080x1920. It is a precision
// upscaler, not a generative one: it adds no detail the draft does not have, so what Muse approved is what plays.
// $0.20 per 10 s of 1080p output, charged once per job.
export async function upscale({ video, out, ledger = "lab/out/ledger.jsonl", budget = +(process.env.BUDGET || 10), scope = "" }) {
  const cost = 0.2, before = spent(ledger, scope);
  if (before + cost > budget) throw new Error(`budget: spent $${before.toFixed(2)} + $${cost} > $${budget}`);
  const auth = { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" };
  const input = { video_url: await again(() => falUpload(video, "video/mp4")), model: "Proteus", upscale_factor: 3, H264_output: true };
  const q = await fetch("https://queue.fal.run/topaz/upscale/video/precision", { method: "POST", headers: auth, body: JSON.stringify(input) }).then((r) => r.json());
  if (!q.status_url) throw new Error(JSON.stringify(q).slice(0, 400));
  fs.appendFileSync(ledger, JSON.stringify({ at: new Date().toISOString(), out, model: "topaz/proteus", cost, request: q.request_id }) + "\n");
  for (;;) {
    await new Promise((r) => setTimeout(r, 4000));
    const s = await fetch(q.status_url, { headers: auth }).then((r) => r.json()).catch(() => ({ status: "IN_PROGRESS" }));
    if (s.status === "COMPLETED") break;
    if (s.status !== "IN_QUEUE" && s.status !== "IN_PROGRESS") throw new Error(JSON.stringify(s).slice(0, 400));
  }
  const r = await again(() => fetch(q.response_url, { headers: auth }).then((x) => x.json()));
  if (!r.video) {
    fs.appendFileSync(ledger, JSON.stringify({ at: new Date().toISOString(), out, cost: -cost, request: q.request_id, failed: JSON.stringify(r).slice(0, 120) }) + "\n");
    throw new Error(`upscale failed: ${JSON.stringify(r).slice(0, 200)}`);
  }
  fs.writeFileSync(out, await again(async () => Buffer.from(await (await fetch(r.video.url)).arrayBuffer())));
  return { out, cost };
}
