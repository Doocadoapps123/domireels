// Lab: Domi Reels' own WhatsApp number, from a Telnyx number to a registered Cloud API number whose webhook is ours.
// One step at a time, because Meta punishes a wrong verification code for days: never send a code to verify unless
// it is demonstrably new (its call came after the request).
// Usage: node --env-file=../.env lab/wa-number.mjs <step>
//   add       add the number to the WhatsApp account, named "Domi Reels"
//   call      give the number voice in Telnyx (the OTP call app) and ask Meta to call it with the code
//   code      read the code from the call's transcription (only a call after the request)
//   verify <code>, register   verify and register it (two-step PIN)
//   hook      our webhook for this number, and the Telnyx voice taken away again
import fs from "node:fs";

// Domi Reels' own WhatsApp account and Meta app (DYMAI Holdings, 4 Nov): nothing of Doocado's (n8n, wa-agent, its route
// guard) touches it. DR_WABA_ID, DR_WA_TOKEN (system user), DR_WA_APP_ID and DR_WA_APP_SECRET live in the env file.
const G = "https://graph.facebook.com/v21.0", WABA = process.env.DR_WABA_ID || "2280359959132322", NUMBER = "4074397335", TELNYX_OTP_APP = "2957234775716267934";
const TOKEN = process.env.DR_WA_TOKEN || process.env.META_WA_TOKEN;
const STATE = `lab/out/wa-number-${WABA}.json`, state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
const meta = async (path, method = "GET", body) => {
  const r = await fetch(`${G}/${path}`, { method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return r.json();
};
const telnyx = async (path, method = "GET", body) => (await fetch(`https://api.telnyx.com/v2/${path}`, { method, headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })).json();
const telnyxId = async () => (await telnyx(`phone_numbers?filter[phone_number]=%2B1${NUMBER}`)).data[0].id;

const [step, arg] = process.argv.slice(2);
if (step === "add") {
  const r = await meta(`${WABA}/phone_numbers?cc=1&phone_number=${NUMBER}&verified_name=${encodeURIComponent("Domi Reels")}`, "POST");
  console.log(r);
  if (r.id) { state.phone_id = r.id; save(); }
}
if (step === "call") {
  console.log("telnyx voice:", (await telnyx(`phone_numbers/${await telnyxId()}`, "PATCH", { connection_id: TELNYX_OTP_APP })).data?.connection_id);
  state.requested_at = new Date().toISOString(); save();
  console.log(await meta(`${state.phone_id}/request_code`, "POST", { code_method: "VOICE", language: "en_US" }));
}
if (step === "code") {
  const key = fs.readFileSync(`${process.env.HOME}/doocado/.n8n-api-key`, "utf8").trim();
  const ex = await (await fetch("https://n8n.doocado.com/api/v1/executions?workflowId=hIDdhlIs17Nfhdr9&limit=5&includeData=true", { headers: { "X-N8N-API-KEY": key } })).json();
  for (const e of ex.data || []) {
    const fresh = new Date(e.startedAt) > new Date(state.requested_at);
    const text = JSON.stringify(e.data?.resultData?.runData || {}).match(/"text":"([^"]{0,300})"/)?.[1] || "";
    console.log(fresh ? "NEW " : "old ", e.startedAt, text, (text.match(/\d[\d\s,.-]{4,}\d/) || [""])[0].replace(/\D/g, ""));
  }
}
if (step === "verify") console.log(await meta(`${state.phone_id}/verify_code`, "POST", { code: arg }));
if (step === "register") console.log(await meta(`${state.phone_id}/register`, "POST", { messaging_product: "whatsapp", pin: process.env.WA_PIN }));
if (step === "hook") {
  console.log("telnyx voice removed:", (await telnyx(`phone_numbers/${await telnyxId()}`, "PATCH", { connection_id: null })).data?.connection_id ?? null);
  // Our own app: its webhook is our server for every number of this account, no override needed.
  const appToken = `${process.env.DR_WA_APP_ID}|${process.env.DR_WA_APP_SECRET}`, url = process.env.WA_WEBHOOK_URL;
  console.log("app webhook:", await (await fetch(`${G}/${process.env.DR_WA_APP_ID}/subscriptions`, { method: "POST", headers: { Authorization: `Bearer ${appToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ object: "whatsapp_business_account", callback_url: url, verify_token: process.env.WA_VERIFY_TOKEN, fields: "messages", include_values: true }) })).json());
  console.log("app subscribed to the account:", await meta(`${WABA}/subscribed_apps`, "POST"));
  console.log(await meta(`${WABA}/subscribed_apps`));
  console.log(await meta(`${state.phone_id}?fields=display_phone_number,verified_name,status,quality_rating`));
}
if (!step) console.log(await meta(`${WABA}/phone_numbers?fields=id,display_phone_number,verified_name,status,code_verification_status,webhook_configuration`));
