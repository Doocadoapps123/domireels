// Muse Voice Transcribe: an owner's voice note, as text. Meta serves it only as a realtime stream
// (wss://api.meta.ai/v1/asr/realtime): a JSON handshake, then raw 16 kHz mono PCM16 in 80 ms packets, then endStream.
// The note is converted with ffmpeg and streamed a little faster than real time (the server holds a few seconds).
import { execFileSync } from "node:child_process";

const URL = "wss://api.meta.ai/v1/asr/realtime", RATE = 16000, PACKET = (RATE * 2 * 80) / 1000;

// audio: any file ffmpeg reads (WhatsApp sends ogg/opus). languages: Muse's names, e.g. ["English", "Spanish"].
export async function transcribe(audio, { languages = ["English", "Spanish"], speed = 2 } = {}) {
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", audio, "-ar", String(RATE), "-ac", "1", "-f", "s16le", "-"], { maxBuffer: 64 * 1024 * 1024 });
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL, { headers: { Authorization: `Bearer ${process.env.META_API_KEY}` } });
    const finals = new Map();
    let last = "";
    const timer = setTimeout(() => { ws.close(); reject(new Error("transcription timed out")); }, 30000 + (pcm.length / (RATE * 2)) * 1000);
    ws.onopen = async () => {
      ws.send(JSON.stringify({ authorization: { accessToken: `Bearer ${process.env.META_API_KEY}` }, audioEncoding: "PCM_16KHZ", model: "muse-voice-transcribe-1.0",
        mode: "PUSH_TO_TALK", partialMode: "CUMULATIVE", emitAudioProgress: false, languageBias: languages }));
      for (let i = 0; i < pcm.length; i += PACKET) {
        if (ws.readyState !== 1) return;
        ws.send(pcm.subarray(i, i + PACKET));
        await new Promise((r) => setTimeout(r, 80 / speed));
      }
      ws.send(JSON.stringify({ type: "endStream" }));
    };
    ws.onmessage = (m) => {
      if (typeof m.data !== "string") return;
      const e = JSON.parse(m.data);
      if (e.type === "error") { clearTimeout(timer); ws.close(); reject(new Error(e.message)); }
      if (typeof e.transcript === "string") { last = e.transcript; if (e.final) finals.set(e.turnId ?? finals.size, e.transcript); }
    };
    ws.onclose = () => { clearTimeout(timer); resolve(([...finals.values()].join(" ") || last).trim()); };
    ws.onerror = () => {};
  });
}

if (process.argv[1]?.endsWith("transcribe.mjs")) console.log(await transcribe(process.argv[2]));
