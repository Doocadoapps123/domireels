// The last mile of a Reel: stock footage, the score and the fast cut, all from a script's `edit` list.
// `out` is the folder that holds the drafts (<name>.mp4), the frames and the stock clips.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const ff = (...a) => execFileSync("ffmpeg", ["-v", "error", "-y", ...a]);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
export const V = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=24,setsar=1";
// The upscaler smooths skin and crust a little; a light moving grain gives the texture back, like a phone sensor.
const GRAIN = ",noise=alls=5:allf=t";
export const probe = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString();
const track = (out, k) => (k === "main" ? `${out}/music.wav` : `${out}/music-${k}.wav`);

// Stock clips are downloaded once; Pexels answers its download link with a redirect to the file.
export async function source(script, out, name) {
  const f = `${out}/${name}.mp4`;
  if (!fs.existsSync(f)) {
    // A clip already downloaded for another run is used first: Pexels answered the fryer with a 403 on 3 Nov.
    const copy = ["lab/out/auto", "lab/out/scripted"].flatMap((r) => (fs.existsSync(r) ? fs.readdirSync(r).map((d) => `${r}/${d}/${name}.mp4`) : [])).find((p) => fs.existsSync(p));
    if (copy) fs.copyFileSync(copy, f);
    else {
      const res = await fetch(script.stock[name].url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`${name}: ${res.status}`);
      fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
    }
  }
  return f;
}

// The score: ElevenLabs on fal (commercial license), from the prompt Muse wrote for this Reel's register.
// script.music.options gives several takes to choose from (music-<name>.wav); otherwise one music.wav.
// An empty prompt is a Reel with no music: only the kitchen sound.
export const hasMusic = (script) => !!(script.music?.options || script.music?.prompt);
// A take that is all drums and sub bass plays as no music on a phone (Pikalo, 3 Nov: its Brazilian funk had 14.6 dB more
// bass than mids; the takes Yansel heard had 1.6 to 5.1). Over 7 dB, a take is made again once with a melody up front.
// The lead is the genre's own: a generic one bolted on (a synth brass over Dora's dembow) made it sound "rara".
const MELODY = " The lead this genre really uses plays a catchy hook on top the whole time, loud in the mids, so it carries on a phone speaker. No instrument the genre does not use.";
const band = (file, af) => +(spawnSync("ffmpeg", ["-i", file, "-af", `${af},volumedetect`, "-f", "null", "-"], { encoding: "utf8" }).stderr.match(/mean_volume: (-?[\d.]+) dB/)?.[1] ?? -60);
export const bassGap = (file) => band(file, "lowpass=f=150") - band(file, "highpass=f=300,lowpass=f=4000");

export async function music(script, out, ledger = "lab/out/ledger.jsonl") {
  if (!hasMusic(script)) return;
  for (const [k, prompt] of Object.entries(script.music.options || { main: script.music.prompt })) {
    const f = track(out, k);
    let best = null;
    for (let t = 0; t < 2 && !fs.existsSync(f); t++) {
      const auth = { Authorization: `Key ${process.env.FAL_KEY}`, "Content-Type": "application/json" }, m = script.music;
      const q = await fetch("https://queue.fal.run/fal-ai/elevenlabs/music", { method: "POST", headers: auth, body: JSON.stringify({ prompt: t ? prompt + MELODY : prompt, music_length_ms: m.ms, force_instrumental: true }) }).then((r) => r.json());
      if (!q.status_url) throw new Error(JSON.stringify(q).slice(0, 400));
      fs.appendFileSync(ledger, JSON.stringify({ at: new Date().toISOString(), out: f, model: "elevenlabs/music", cost: +(0.6 * m.ms / 60000).toFixed(3), request: q.request_id }) + "\n");
      for (let s; (s = await fetch(q.status_url, { headers: auth }).then((r) => r.json())).status !== "COMPLETED"; await new Promise((r) => setTimeout(r, 3000)))
        if (s.status !== "IN_QUEUE" && s.status !== "IN_PROGRESS") throw new Error(JSON.stringify(s).slice(0, 400));
      const a = (await fetch(q.response_url, { headers: auth }).then((r) => r.json())).audio;
      const mp3 = f.replace(".wav", `-take${t}.mp3`), wav = mp3.replace(".mp3", ".wav");
      fs.writeFileSync(mp3, Buffer.from(await (await fetch(a.url || a)).arrayBuffer()));
      ff("-i", mp3, wav);
      const gap = bassGap(wav);
      console.log(`${wav}: bass ${gap.toFixed(1)} dB over the mids`);
      // The second take keeps only if it carries better than the first (Dora's came out 9.6 against 8.3).
      if (!best || gap < best.gap) best = { gap, wav, mp3 };
      if (gap <= 7 || t) { fs.copyFileSync(best.wav, f); fs.copyFileSync(best.mp3, f.replace(".wav", ".mp3")); }
    }
    console.log(`${f}: ${probe(f).toFixed(2)} s, last hit at ${lastAccent(f)} s`);
  }
}

// The final fast cut. Every shot carries the sound of the seconds it shows (Omni records the sizzle, the
// clack of the pour, the crunch); stock and stills borrow sound from a draft. The score leads: the kitchen sound
// sits under it and only dips it a little. Its last hit lands on the payoff and the music plays on to the end, fading
// out over the last 0.6 s (it used to stop right after the payoff, and Yansel asked for music to feel the vibe). Audio stays at 48 kHz: phones play 96 kHz silent.
// A still is the real photo (or e.photo, cropped to 9:16 by e.crop) with a slow handheld push-in.
// Its JPEG is full range and the clips are TV range: concatenated without re-encoding, the first part's flag wins,
// so a Reel that opened on a still played every clip washed out (Dora, 2 Nov). The still is converted to TV range.
export async function render(script, out) {
  const file = (src) => (src === "real" ? script.real : `${out}/${src}.mp4`);
  // Footage that cannot be fetched at render (Mixkit answered 403 to Pikalo's fryer, 4 Nov, after $3.26 of takes) is
  // left out of the cut instead of losing the Reel.
  for (const src of [...new Set(script.edit.filter((e) => script.stock?.[e.src]).map((e) => e.src))]) {
    try { await source(script, out, src); }
    catch (e) { console.log(`${src}: footage not fetched (${e.message}), left out of the cut`); script.edit = script.edit.filter((x) => x.src !== src); }
  }
  const enc = ["-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p"];
  const VF = V.replace("increase", "increase:flags=lanczos");
  let t0 = 0, payoff = null;
  const parts = script.edit.map((e, i) => {
    const v = `${out}/e${String(i).padStart(2, "0")}.mp4`, a = v.replace(".mp4", ".wav"), crop = e.crop ? `crop=${e.crop},` : "";
    if (e.still) {
      const n = Math.round(e.dur * 24);
      // A spread (pan): the camera travels down the table from the first dish to the last, close, like a documentary.
      const move = e.pan ? `z='1.45':x='iw/2-iw/zoom/2+18*sin(on/9)':y='(ih-ih/zoom)*(0.04+0.92*on/${n})'` : `z='1.03+0.04*on/${n}':x='iw/2-iw/zoom/2+4*sin(on/3)':y='ih/2-ih/zoom/2+4*cos(on/4)'`;
      ff("-i", e.photo || script.real, "-vf", `${crop}scale=2160:3840,zoompan=${move}:d=${n}:s=1080x1920:fps=24,scale=out_range=tv,format=yuv420p,setsar=1`, "-frames:v", String(n), ...enc, v);
    } else ff("-ss", String(e.at), "-i", file(e.src), "-t", String(e.dur), "-vf", crop + VF + (e.src.endsWith(".hd") ? GRAIN : ""), ...enc, v);
    const t = Math.round(probe(v) * 24) / 24, s = e.sound || (e.still || script.stock?.[e.src] ? null : { src: e.src, at: e.at, gain: e.gain });
    if (s) ff("-ss", String(s.at), "-t", String(t), "-i", file(s.src), "-vn", "-ac", "2", "-ar", "48000", "-af", `volume=${s.gain || 0}dB,afade=t=in:d=0.008,afade=t=out:st=${t - 0.008}:d=0.008,apad=whole_dur=${t}`, a);
    else ff("-f", "lavfi", "-t", String(t), "-i", "anullsrc=r=48000:cl=stereo", a);
    if (e.payoff != null) payoff = t0 + e.payoff;
    t0 += t;
    return [v, a];
  });
  const list = (k, f) => { fs.writeFileSync(f, parts.map((p) => `file '${path.resolve(p[k])}'`).join("\n")); return f; };
  ff("-f", "concat", "-safe", "0", "-i", list(0, `${out}/edit-v.txt`), "-c", "copy", `${out}/edit-v.mp4`);
  ff("-f", "concat", "-safe", "0", "-i", list(1, `${out}/edit-a.txt`), "-c", "copy", `${out}/edit-sfx.wav`);
  const mux = ["-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-ar", "48000", "-b:a", "192k", "-movflags", "+faststart", "-shortest"];
  ff("-i", `${out}/edit-v.mp4`, "-i", `${out}/edit-sfx.wav`, "-filter_complex", "[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]", ...mux, `${out}/final-asmr.mp4`);
  // No music: the kitchen sound alone is the Reel's sound.
  if (!hasMusic(script)) fs.copyFileSync(`${out}/final-asmr.mp4`, `${out}/final.mp4`);
  // One final per music take: final.mp4 for the chosen one (or the only one), final-<name>.mp4 for the others.
  for (const k of hasMusic(script) ? Object.keys(script.music.options || { main: 1 }) : []) {
    // A few % of tempo moves the hit onto the payoff; a hit that comes much later is reached by skipping the start instead.
    // Never more than 8%: a track that ends too early is a bad take, not something to slow down.
    const m = track(out, k), hit = lastAccent(m), skip = hit / payoff > 1.08 ? hit - payoff : 0;
    // Levels are set in the band a phone speaker plays (300 Hz-5 kHz), not in full loudness: Pikalo's Brazilian funk was
    // 10 dB of sub bass, so the full-band mix put it on top and the phone played only the kitchen (Yansel, 3 Nov: "la
    // música no la escucho"). The music sits 8 dB over the kitchen sound in that band.
    const mGain = (-22 - phoneLevel(m)).toFixed(1), sGain = (-30 - phoneLevel(`${out}/edit-sfx.wav`)).toFixed(1);
    const rate = Math.min(1.08, Math.max(0.92, (hit - skip) / payoff)).toFixed(4);
    const mix = `${out}/mix-${k}.wav`;
    ff("-i", m, "-i", `${out}/edit-sfx.wav`, "-filter_complex",
      `[0:a]atrim=${skip},asetpts=PTS-STARTPTS,atempo=${rate},atrim=0:${t0},asetpts=PTS-STARTPTS,aresample=48000,bass=g=-5:f=110,volume=${mGain}dB,afade=t=out:st=${Math.max(payoff + 0.05, t0 - 0.6)}:d=0.6,apad=whole_dur=${t0}[m];` +
      `[1:a]volume=${sGain}dB,asplit=2[s][sc];[m][sc]sidechaincompress=threshold=0.1:ratio=1.5:attack=5:release=180[md];` +
      "[md][s]amix=inputs=2:normalize=0:duration=longest,highpass=f=35[a]", "-map", "[a]", "-ar", "48000", mix);
    // The whole Reel is set to the phone-band level of the Reels whose music Yansel heard (-22 dB), then limited.
    // Instagram's loudness (-14 LUFS) with a true-peak ceiling: alimiter's auto level pushed the mix back to 0 dB and the
    // AAC encode overshot to +2-4 dBFS (Reels of 4 Nov), which crackles on a phone speaker.
    ff("-i", `${out}/edit-v.mp4`, "-i", mix, "-filter_complex", `[1:a]volume=${(-22 - phoneLevel(mix)).toFixed(1)}dB,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
      ...mux, k === "main" || k === script.music.pick ? `${out}/final.mp4` : `${out}/final-${k}.mp4`);
  }
  console.log(`${out}/final.mp4 ${t0.toFixed(2)} s, payoff at ${payoff?.toFixed(2)} s`);
  return { file: `${out}/final.mp4`, seconds: t0, payoff };
}

// The track's final hit: the last sharp rise in loudness before the music goes quiet, at its peak.
export function lastAccent(wav) {
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", wav, "-ac", "1", "-ar", "22050", "-f", "s16le", "-"], { maxBuffer: 1e8 });
  const x = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1), hop = 512, rms = [];
  for (let i = 0; i + hop <= x.length; i += hop) { let s = 0; for (let j = i; j < i + hop; j++) s += x[j] * x[j]; rms.push(Math.sqrt(s / hop)); }
  const top = rms.reduce((a, b) => Math.max(a, b), 0);
  let k = rms.length - 1;
  while (k > 0 && rms[k] < top * 0.05) k--;
  while (k > 1 && rms[k] - rms[k - 1] < top * 0.1) k--;
  while (k + 1 < rms.length && rms[k + 1] > rms[k]) k++;
  return +((k * hop) / 22050).toFixed(2);
}

// Mean level of a track in the band a phone speaker plays, in dB.
export function phoneLevel(file) {
  const log = spawnSync("ffmpeg", ["-i", file, "-af", "highpass=f=300,highpass=f=300,lowpass=f=5000,volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  return +(log.match(/mean_volume: (-?[\d.]+) dB/)?.[1] ?? -40);
}
