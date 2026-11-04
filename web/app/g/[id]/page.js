// "How Muse directed it": one public Reel, opened up. Everything here comes from reels.director.gallery
// (src/server/gallery.mjs); each part shows only when the run left it. The site is in English, so it reads only the
// gallery's English fields, never the reel's own title, idea or kind (those are in the owner's language).
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SiteHeader, SiteFooter } from "@/components/Brand";
import ReelPlayer from "@/components/ReelPlayer";
import { IconArrow, IconCheck } from "@/components/Icons";
import { db, must, isUuid } from "@/lib/db";
import { media, publicMedia } from "@/lib/reels";

export const revalidate = 60;

const load = cache(async (id) => {
  if (!isUuid(id)) return null;
  const [row] = await must(
    db.from("reels").select("id, seconds, cover_path, versions, chosen, director, cost, created_at, restaurants(name, city, cuisine)")
      .eq("id", id).eq("public", true).limit(1),
  );
  if (!row) return null;
  const [reel] = await publicMedia([row]);
  return reel;
});

export async function generateMetadata({ params }) {
  const { id } = await params;
  const reel = await load(id).catch(() => null);
  if (!reel) return { title: "Reel not found" };
  const g = reel.director?.gallery || {};
  const title = reel.heading;
  const place = g.restaurant || reel.restaurants?.name;
  return {
    title: `${title}: how Muse directed it`,
    description: `How Meta's Muse turned ${place ? `${place}'s` : "a restaurant's"} real food photos into this Reel: what it saw, the idea, every take it kept and threw away.`,
    openGraph: { images: reel.cover ? [{ url: reel.cover }] : [] },
  };
}

// ---- small formatters --------------------------------------------------------------------------------------------
const num = (n) => (Number.isFinite(+n) ? +(+n).toFixed(2) : null);
const sec = (n) => (num(n) == null ? "" : `${num(n)}s`);
const txt = (x) => (x == null ? "" : typeof x === "string" ? x : typeof x === "number" ? String(x) : x.name || x.label || x.what || x.text || "");
const arr = (x) => (Array.isArray(x) ? x.map(txt).filter(Boolean) : []);
const SCORE_NAMES = { appetite: "Appetite", scroll_stop: "Scroll stop", originality: "Originality", realism: "Realism", photos: "Photos", photos_thumb: "Thumbnail" };
const label = (k) => SCORE_NAMES[k] || k.replace(/_/g, " ");

function scoresOf(s) {
  if (!s || typeof s !== "object") return { bars: [], note: "" };
  const bars = Object.entries(s).filter(([k, v]) => k !== "index" && typeof v === "number" && Number.isFinite(v)).map(([k, v]) => ({ k, v }));
  const top = Math.max(...bars.map((b) => b.v), 0);
  const scale = top <= 1 ? 1 : top <= 10 ? 10 : 100;
  return { bars: bars.map((b) => ({ ...b, pct: Math.max(2, Math.min(100, (b.v / scale) * 100)) })), note: typeof s.note === "string" ? s.note : "", scale };
}

// A take's kept windows as {from, to, shows}; the run writes [from, to, shows].
const keptOf = (t) => (Array.isArray(t.kept) ? t.kept : []).map((k) => (Array.isArray(k) ? { from: +k[0], to: +k[1], shows: txt(k[2]) } : { from: +k.from, to: +k.to, shows: txt(k.shows) })).filter((k) => Number.isFinite(k.from) && Number.isFinite(k.to) && k.to > k.from);
const avoidOf = (t) => (Array.isArray(t.avoid) ? t.avoid : []).map((a) => ({ at: +a.at, why: txt(a.why) })).filter((a) => Number.isFinite(a.at));

function Timeline({ kept, avoid, length }) {
  const len = length || Math.max(1, Math.ceil(Math.max(...kept.map((k) => k.to), ...avoid.map((a) => a.at + 0.25), 1)));
  const pos = (s) => `${Math.max(0, Math.min(100, (s / len) * 100))}%`;
  return (
    <div>
      <div className="timeline" role="img" aria-label={`Take timeline, ${len} seconds: ${kept.length} kept windows, ${avoid.length} marked to avoid`}>
        {kept.map((k, i) => <span key={`k${i}`} className="tl-keep" style={{ left: pos(k.from), width: `calc(${pos(k.to)} - ${pos(k.from)})` }} />)}
        {avoid.map((a, i) => <span key={`a${i}`} className="tl-avoid" style={{ left: pos(a.at) }} />)}
      </div>
      <div className="tl-scale"><span>0s</span><span>{len}s</span></div>
    </div>
  );
}

function Chapter({ id, n, title, intro, children }) {
  return (
    <section className="chapter" id={id}>
      <div className="wrap">
        <div className="chapter-head">
          <span className="chapter-n">{n}</span>
          <h2>{title}</h2>
          {intro ? <p className="lede">{intro}</p> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

export default async function DirectedPage({ params }) {
  const { id } = await params;
  const reel = await load(id);
  if (!reel) notFound();

  const g = reel.director?.gallery || {};
  const place = g.restaurant || reel.restaurants?.name || "the restaurant";
  const title = reel.heading;
  const photos = (Array.isArray(g.photos) ? g.photos : []).map((p) => ({ url: media(typeof p === "string" ? p : p.url), caption: txt(p.caption) })).filter((p) => p.url);
  const saw = (Array.isArray(g.saw) ? g.saw : []).filter((s) => s && (s.dish || s.hungriest));
  const idea = g.idea && (g.idea.idea || g.idea.why || g.idea.kind) ? g.idea : null;
  const scores = scoresOf(idea?.scores);
  const board = media(g.board);
  const takes = (Array.isArray(g.takes) ? g.takes : []).map((t) => ({ ...t, keptW: keptOf(t), avoidW: avoidOf(t), sheetUrl: media(t.sheet) }));
  const review = g.review && (g.review.approved != null || g.review.notes?.length) ? g.review : null;
  const seconds = num(g.seconds ?? reel.seconds);
  const keptTotal = num(takes.reduce((s, t) => s + t.keptW.reduce((a, k) => a + (k.to - k.from), 0), 0));
  const tries = takes.reduce((s, t) => s + (Number.isInteger(t.tries) ? t.tries : 1), 0);
  const cost = num(g.cost ?? reel.cost);
  const hasStory = photos.length || saw.length || idea || board || takes.length || review;
  const stats = [
    seconds && [`${seconds}s`, "Final Reel"],
    takes.length && [tries, tries === 1 ? "Take filmed" : "Takes filmed"],
    keptTotal && [`${keptTotal}s`, "Good seconds found"],
    cost != null && [`$${cost.toFixed(2)}`, "Spent on AI"],
    photos.length && [photos.length, photos.length === 1 ? "Real photo" : "Real photos"],
    saw.length && [saw.length, saw.length === 1 ? "Dish studied" : "Dishes studied"],
  ].filter(Boolean).slice(0, 4);

  const toc = [
    photos.length && ["photos", "The photos"],
    saw.length && ["saw", "What Muse saw"],
    idea && ["idea", "The idea"],
    board && ["board", "Storyboard"],
    takes.length && ["takes", "Every take"],
    review && ["review", "Last look"],
    ["final", "The Reel"],
  ].filter(Boolean);
  let n = 0;
  const next = () => String(++n).padStart(2, "0");

  return (
    <>
      <div className="glow" />
      <SiteHeader />
      <main>
        <div className="wrap">
          <div className="bts-hero">
            <ReelPlayer src={reel.video} poster={reel.cover} auto badge={place} label={title} />
            <div className="stack gap-24">
              <div className="stack gap-12">
                <h1 style={{ fontSize: "clamp(2.2rem, 7vw, 4.2rem)" }}>{title}</h1>
                <p className="lede">
                  {idea?.idea || g.summary || `A Reel for ${place}, directed end to end by Meta's Muse from the restaurant's own food photos.`}
                </p>
              </div>
              <div className="row-wrap">
                <span className="chip chip-accent">{place}</span>
                {idea?.kind ? <span className="chip">{idea.kind}</span> : null}
                {g.music ? <span className="chip">Music: {g.music}</span> : null}
                {g.rhythm ? <span className="chip">Rhythm: {g.rhythm}</span> : null}
              </div>
              {stats.length ? (
                <div className="stats">
                  {stats.map(([v, l]) => <div className="stat" key={l}><div className="stat-v">{v}</div><div className="stat-l">{l}</div></div>)}
                </div>
              ) : null}
              {hasStory ? (
                <nav className="toc" aria-label="Chapters">
                  {toc.map(([h, t]) => <a key={h} href={`#${h}`} className="chip">{t}</a>)}
                </nav>
              ) : null}
            </div>
          </div>
        </div>

        {photos.length ? (
          <Chapter id="photos" n={next()} title={photos.length === 1 ? "Started from this single photo" : `Started from these ${photos.length} photos`}
            intro={`Still photos from ${place}'s menu, taken on a phone. No studio, no stylist. Every shot in the Reel starts from ${photos.length === 1 ? "this one" : "one of these"}.`}>
            <div className="shots">
              {photos.map((p, i) => (
                <figure className="shot" key={i}>
                  <span className="still">
                    <img src={p.url} alt={`A still photo${p.caption ? ` of ${p.caption}` : ""} from ${place}`} loading="lazy" />
                    <span className="still-tag" aria-hidden="true">Photo</span>
                  </span>
                  {p.caption ? <figcaption>{p.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
          </Chapter>
        ) : null}

        {saw.length ? (
          <Chapter id="saw" n={next()} title="What Muse saw" intro="Before planning anything, Muse looked at each dish like a line cook and wrote down what the photo can really do, and what it cannot.">
            <div className="saw">
              {saw.map((s, i) => {
                const layers = arr(s.layers), hands = arr(s.hands), weak = arr(s.weak);
                return (
                  <div className="card saw-card" key={i}>
                    <h3>{txt(s.dish)}</h3>
                    {s.hungriest ? (
                      <div className="saw-row">
                        <span className="saw-k">The hungriest part</span>
                        <p className="quote">&ldquo;{txt(s.hungriest)}&rdquo;</p>
                      </div>
                    ) : null}
                    {layers.length ? (
                      <div className="saw-row">
                        <span className="saw-k">Layers it can peel back, top to bottom</span>
                        <div className="chips">{layers.map((l, j) => <span key={j} className="chip">{l}</span>)}</div>
                      </div>
                    ) : null}
                    {hands.length ? (
                      <div className="saw-row">
                        <span className="saw-k">What a hand can do to it</span>
                        <ul className="notes">{hands.map((h, j) => <li key={j}>{h}</li>)}</ul>
                      </div>
                    ) : null}
                    <div className="saw-row">
                      <span className="saw-k">What is weak in the photo</span>
                      {weak.length ? <div className="chips">{weak.map((w, j) => <span key={j} className="chip chip-bad">{w}</span>)}</div> : <span className="small dim">Nothing. Muse can use all of it.</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Chapter>
        ) : null}

        {idea ? (
          <Chapter id="idea" n={next()} title="The idea, and why it won" intro="Muse pitched several Reels for the week from what the photos can do. A separate Muse judge scored them blind against everything the restaurant already posted. This one won.">
            <div className="idea">
              <div className="card card-lg stack gap-16">
                <div className="row-wrap">{idea.kind ? <span className="chip chip-accent">{idea.kind}</span> : null}</div>
                <h3 style={{ fontSize: "clamp(1.5rem, 4vw, 2.1rem)" }}>{idea.title || title}</h3>
                {idea.idea ? <p className="muted">{idea.idea}</p> : null}
                {idea.why ? (
                  <div className="saw-row">
                    <span className="saw-k">Why it can be made from the real photo</span>
                    <p className="muted">{idea.why}</p>
                  </div>
                ) : null}
              </div>
              {scores.bars.length || scores.note ? (
                <div className="card card-lg stack gap-16">
                  <span className="saw-k">The judge&apos;s scores{scores.scale ? `, out of ${scores.scale}` : ""}</span>
                  {scores.bars.length ? (
                    <div className="bars">
                      {scores.bars.map((b) => (
                        <div className="bar-row" key={b.k}>
                          <span className="bar-label">{label(b.k)}</span>
                          <span className="bar-track"><span className="bar-fill" style={{ width: `${b.pct}%`, display: "block" }} /></span>
                          <span className="bar-v">{b.v}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {scores.note ? <p className="quote" style={{ fontSize: "1.1rem" }}>&ldquo;{scores.note}&rdquo;</p> : null}
                </div>
              ) : null}
            </div>
          </Chapter>
        ) : null}

        {board ? (
          <Chapter id="board" n={next()} title="The storyboard" intro="Every shot, planned and drawn from the real photo before a single second was filmed.">
            <a href={board} target="_blank" rel="noreferrer" className="board" style={{ display: "block" }}>
              <img src={board} alt={`Storyboard for ${title}`} loading="lazy" />
            </a>
            <p className="small dim mt-8">Scroll through it, or tap to open it full size.</p>
          </Chapter>
        ) : null}

        {takes.length ? (
          <Chapter id="takes" n={next()} title="Every take" intro="Muse filmed cheap drafts first and watched each one like an editor watching dailies. It kept only the seconds that play clean, and marked the moments that went wrong.">
            <div className="legend mt-8" style={{ marginTop: -8, marginBottom: 20 }}>
              <span><i style={{ background: "var(--good)" }} />Seconds Muse kept for the cut</span>
              <span><i style={{ background: "var(--bad)" }} />A moment Muse threw away</span>
            </div>
            <div className="takes">
              {takes.map((t, i) => (
                <div className="card take" key={i}>
                  <div className="stack gap-12">
                    <div className="row-wrap">
                      <span className="chip chip-accent">Shot {txt(t.shot) || i + 1}</span>
                      {Number.isInteger(t.tries) && t.tries > 1 ? <span className="chip">{t.tries} tries</span> : null}
                      {t.keptW.length ? <span className="chip chip-good">{num(t.keptW.reduce((a, k) => a + k.to - k.from, 0))}s kept</span> : null}
                    </div>
                    {t.what ? <p style={{ fontSize: "1.02rem" }}>{txt(t.what)}</p> : null}
                    {t.sheetUrl ? (
                      <a href={t.sheetUrl} target="_blank" rel="noreferrer" className="take-sheet" style={{ display: "block" }}>
                        <img src={t.sheetUrl} alt={`Frames from the take for shot ${txt(t.shot) || i + 1}`} loading="lazy" />
                      </a>
                    ) : null}
                  </div>
                  <div className="stack gap-16">
                    {t.keptW.length || t.avoidW.length ? <Timeline kept={t.keptW} avoid={t.avoidW} length={num(t.seconds)} /> : null}
                    {t.keptW.length ? (
                      <div className="saw-row">
                        <span className="saw-k">Kept</span>
                        <ul className="notes">
                          {t.keptW.map((k, j) => (
                            <li key={j}><span className="mono" style={{ color: "var(--good)" }}>{sec(k.from)} to {sec(k.to)}</span>{k.shows ? <span className="muted">. {k.shows}</span> : null}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {t.avoidW.length ? (
                      <div className="saw-row">
                        <span className="saw-k">Thrown away</span>
                        <ul className="notes">
                          {t.avoidW.map((a, j) => (
                            <li key={j}><span className="mono" style={{ color: "var(--bad)" }}>At {sec(a.at)}</span>{a.why ? <span className="muted">. {a.why}</span> : null}</li>
                          ))}
                        </ul>
                      </div>
                    ) : t.keptW.length ? <p className="small dim">Nothing in this take had to go.</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </Chapter>
        ) : null}

        {review ? (
          <Chapter id="review" n={next()} title="The last look" intro="Before anything leaves, Muse watches the finished Reel one more time, the way the owner will see it on a phone.">
            <div className="card card-lg stack gap-16">
              {review.approved != null ? (
                <span className="verdict" style={{ color: review.approved ? "var(--good)" : "var(--bad)" }}>
                  {review.approved ? <><IconCheck size={30} /> Approved</> : "Sent back"}
                </span>
              ) : null}
              {arr(review.notes).length ? <ul className="notes">{arr(review.notes).map((x, j) => <li key={j}>{x}</li>)}</ul> : null}
            </div>
          </Chapter>
        ) : null}

        <Chapter id="final" n={next()} title="The Reel" intro={hasStory ? null : "Muse's notes for this Reel are on their way. Here is the finished cut."}>
          <div className="final">
            <ReelPlayer src={reel.video} poster={reel.cover} controls label={title} />
            <div className="stack gap-16">
              <p className="display" style={{ fontSize: "clamp(1.5rem, 4vw, 2.2rem)", lineHeight: 1.2 }}>
                {[
                  photos.length ? `${photos.length} real photo${photos.length === 1 ? "" : "s"}` : null,
                  tries ? `${tries} take${tries === 1 ? "" : "s"} filmed` : null,
                  keptTotal ? `${keptTotal} good seconds found` : null,
                ].filter(Boolean).join(", ") || "Directed by Muse"}
                {seconds ? `. One ${seconds}-second Reel.` : "."}
              </p>
              <p className="muted">
                Every creative call was Muse&apos;s: the idea, the shots, which seconds stayed, the words on screen and the music.
                {cost != null ? ` All of it cost $${cost.toFixed(2)} in AI calls.` : ""} The owner got it on WhatsApp and posts it from their own account.
              </p>
              <div className="cta-row mt-8">
                <Link href="/#gallery" className="btn btn-ghost">More Reels</Link>
                <Link href="/signup" className="btn btn-primary">Have an invitation code? <IconArrow size={18} /></Link>
              </div>
            </div>
          </div>
        </Chapter>
      </main>
      <SiteFooter />
    </>
  );
}
