"use client";
import { useState } from "react";
import ReelPlayer from "./ReelPlayer";
import CopyButton from "./CopyButton";
import { IconCheck, IconDownload } from "./Icons";

export default function OwnerReel({ id, k, title, place, idea, cover, versions, chosen: initial }) {
  const [chosen, setChosen] = useState(initial);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const many = versions.length > 1;

  async function choose(i) {
    setBusy(i);
    setError("");
    try {
      const r = await fetch(`/api/reels/${id}/choose`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k, i }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not save your choice.");
      setChosen(i);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack gap-32" style={{ paddingTop: 8 }}>
      <div className="stack gap-12 center" style={{ alignItems: "center" }}>
        {place ? <span className="muted">{place}</span> : null}
        <h1 style={{ fontSize: "clamp(2rem, 7vw, 3.4rem)", maxWidth: 820 }}>{title}</h1>
        {many ? (
          <p className="lede" style={{ maxWidth: 560 }}>
            Same cut, {versions.length} different songs. Choose the one you like and Muse will remember your taste for the next Reel.
          </p>
        ) : idea ? <p className="lede" style={{ maxWidth: 560 }}>{idea}</p> : null}
      </div>

      {error ? <div className="alert alert-bad" style={{ maxWidth: 560, margin: "0 auto" }}>{error}</div> : null}

      <div className="versions">
        {versions.map((v) => {
          const isChosen = chosen === v.i;
          return (
            <div className="version" key={v.i}>
              <ReelPlayer src={v.play} poster={cover} controls label={`${title}, ${v.register || `version ${v.i + 1}`}`} />
              <div className="version-label">
                {many ? <span className="version-n">{v.i + 1}</span> : null}
                <span className="version-reg">{v.register || (many ? `Version ${v.i + 1}` : "Your Reel")}</span>
                {isChosen && many ? <span className="chip chip-good" style={{ marginLeft: "auto" }}>Your pick</span> : null}
              </div>
              {v.owner ? <p className="small dim">Made from your words: &ldquo;{v.owner}&rdquo;</p> : null}
              <div className="stack gap-8">
                {many ? (
                  <button type="button" className={`btn btn-block ${isChosen ? "btn-chosen" : "btn-primary"}`} disabled={busy != null} onClick={() => choose(v.i)} aria-pressed={isChosen}>
                    {isChosen ? <><IconCheck size={18} /> Chosen</> : busy === v.i ? "Saving..." : "Choose this one"}
                  </button>
                ) : null}
                <a href={v.download} className="btn btn-ghost btn-block"><IconDownload size={18} /> Download full quality</a>
              </div>
            </div>
          );
        })}
      </div>

      <div className="wrap-narrow stack gap-16" style={{ padding: 0 }}>
        <div className="card stack gap-8">
          <span className="panel-title">Before you post</span>
          <p className="muted small">
            Domi prepares, you publish. Download the version you like, post it from your own Instagram or TikTok.
            This Reel was made with AI, so turn on the AI label in the app when you post.
          </p>
        </div>
      </div>
    </div>
  );
}
