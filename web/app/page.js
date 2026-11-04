import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/Brand";
import ReelPlayer from "@/components/ReelPlayer";
import { IconArrow } from "@/components/Icons";
import { publicReels, andList } from "@/lib/reels";

export const revalidate = 60;

const STEPS = [
  { t: "Photos in", d: "Send the food photos you already have on WhatsApp, or upload them. The dishes, the fryer, the griddle, the storefront. A voice note works too." },
  { t: "Muse looks at every photo", d: "And decides what each one can do: the layers a dish peels into, what a hand can do to it, the photo that is too weak to use." },
  { t: "Muse directs the Reel", d: "It pitches the idea, plans the shots from your real photo, watches every take, keeps only the good seconds, then adds the text and the music." },
  { t: "It arrives on WhatsApp", d: "Ready to post, with the caption written. Pick the music you like best and Muse remembers your taste for the next one." },
];

const MODELS = [
  { n: "Muse Spark", d: "Every creative call. The idea, the shots, which seconds stay, the words on screen, the last look." },
  { n: "Muse Image", d: "Draws each shot from the restaurant's own photo, so the dish on screen is the dish they serve." },
  { n: "SAM 3.1", d: "Finds the dish, its plate and every part of it in each frame, so no food floats off the plate." },
  { n: "Muse Voice Transcribe", d: "Understands the owner's voice notes on WhatsApp, in English or Spanish." },
];

export default async function Home() {
  const reels = await publicReels(24).catch(() => []);
  const hero = reels.find((r) => r.video) || null;

  return (
    <>
      <div className="glow" />
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="wrap hero-grid">
            <div className="stack gap-24">
              <h1>Your food photos, <em>directed</em> into Reels.</h1>
              <p className="lede">
                A restaurant sends the photos it already has. Muse, Meta&apos;s AI, directs a Reel that keeps the real food,
                and sends it on WhatsApp, ready to post.
              </p>
              <div className="cta-row">
                <Link href="/signup" className="btn btn-primary">Have an invitation code?</Link>
                <Link href="/login" className="btn btn-ghost">Sign in</Link>
              </div>
              <p className="small dim">Built on Meta&apos;s Muse Spark, Muse Image, SAM 3.1 and Muse Voice Transcribe.</p>
            </div>
            <div className="hero-reel">
              <div className="hero-tilt">
                {hero ? (
                  <ReelPlayer src={hero.video} poster={hero.cover} auto badge={hero.place} label={hero.heading} />
                ) : (
                  <div className="phone phone-empty">
                    <div className="stack gap-12" style={{ alignItems: "center" }}>
                      <span className="display" style={{ fontSize: "1.6rem", color: "var(--text)" }}>Muse is directing</span>
                      <span className="small">The first Reels are being made right now.</span>
                    </div>
                  </div>
                )}
              </div>
              {hero ? (
                <Link href={`/g/${hero.id}`} className="link row gap-8 mt-24" style={{ justifyContent: "center" }}>
                  See how Muse directed it <IconArrow size={18} />
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <div className="wrap">
            <div className="section-head">
              <h2>From a photo on your phone to a Reel worth posting.</h2>
            </div>
            <ol className="steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {STEPS.map((s, i) => (
                <li className="step" key={s.t}>
                  <span className="step-n">{i + 1}</span>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </li>
              ))}
            </ol>
            <div className="card card-lg mt-24 stack gap-8" style={{ background: "linear-gradient(135deg, rgba(255,98,54,0.1), rgba(255,181,71,0.04))" }}>
              <p className="display" style={{ fontSize: "clamp(1.4rem, 4vw, 2rem)", lineHeight: 1.2 }}>
                The food on screen is the food you serve. Muse never invents a dish.
              </p>
              <p className="muted">
                Every shot starts from the restaurant&apos;s own photo. SAM 3.1 finds the dish and its parts, and Muse checks every
                frame against the real thing before it keeps a second of it.
              </p>
            </div>
          </div>
        </section>

        <section className="section" id="gallery">
          <div className="wrap">
            <div className="section-head">
              <h2>Reels from real restaurants.</h2>
              <p className="lede">Tap any Reel to see how Muse directed it: the photos it got, what it saw, every take it kept and every one it threw away.</p>
            </div>
            {reels.length ? (
              <div className="reel-grid">
                {reels.map((r) => (
                  <Link key={r.id} href={`/g/${r.id}`} className="reel-card">
                    <div style={{ position: "relative" }}>
                      <ReelPlayer src={r.video} poster={r.cover} inView sound={false} label={r.heading} />
                      <span className="reel-card-cta">How Muse directed it</span>
                    </div>
                    <div>
                      <div className="reel-card-title">{r.heading}</div>
                      <div className="reel-card-meta">{r.where}</div>
                    </div>
                    {r.sources.length ? (
                      <div className="reel-source">
                        <span className="reel-source-k">
                          {r.sources.length === 1 ? "Started from this single photo" : `Started from these ${r.sources.length} photos`}
                        </span>
                        <div className="reel-source-row">
                          <div className={r.sources.length === 1 ? "stills stills-one" : "stills"} style={{ "--n": Math.min(r.sources.length, 4) }}>
                            {r.sources.map((s, i) => (
                              <span className="still" key={i}>
                                <img src={s.url} alt={`A still photo${s.dish ? ` of ${s.dish}` : ""} from ${r.place || "the restaurant"}`} loading="lazy" />
                                <span className="still-tag" aria-hidden="true">Photo</span>
                              </span>
                            ))}
                          </div>
                          {r.sources.length === 1 && r.sources[0].dish ? <span className="reel-source-dish">{r.sources[0].dish}</span> : null}
                        </div>
                        {r.sources.length > 1 ? <span className="reel-source-dishes">{andList(r.sources.map((s) => s.dish).filter(Boolean))}</span> : null}
                      </div>
                    ) : null}
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty">The first Reels are being made right now. Check back soon.</div>
            )}
          </div>
        </section>

        <section className="section" id="muse">
          <div className="wrap">
            <div className="section-head">
              <h2>Muse makes every creative call.</h2>
              <p className="lede">No person writes a script, picks a frame or chooses a cut.</p>
            </div>
            <div className="models">
              {MODELS.map((m) => (
                <div className="model" key={m.n}>
                  <div className="model-name">{m.n}</div>
                  <p className="muted small">{m.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }}>
          <div className="wrap stack gap-16">
            <div className="band">
              <div className="stack gap-12">
                <h2 style={{ fontSize: "clamp(1.7rem, 4.6vw, 2.5rem)" }}>Your restaurants already have the photos.</h2>
                <p className="muted">
                  If you run an ordering platform, connect them through the Domi Reels API. You hand over the menu and the photos, Muse hands back Reels as
                  drafts your owners post from their own accounts.
                </p>
              </div>
              <div><Link href="/docs" className="btn btn-ghost">Read the API docs <IconArrow size={18} /></Link></div>
            </div>
            <div className="band" style={{ background: "linear-gradient(135deg, #3a1a10, #22140e)" }}>
              <div className="stack gap-12">
                <h2 style={{ fontSize: "clamp(1.7rem, 4.6vw, 2.5rem)" }}>Domi Reels opens one restaurant at a time.</h2>
                <p className="muted">If you have an invitation code, your first Reel is a few photos away.</p>
              </div>
              <div className="cta-row">
                <Link href="/signup" className="btn btn-primary">Have an invitation code?</Link>
                <Link href="/login" className="btn btn-ghost">Sign in</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
