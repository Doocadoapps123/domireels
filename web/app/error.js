"use client";

export default function Error({ reset }) {
  return (
    <main className="wrap-narrow" style={{ padding: "80px 16px", textAlign: "center" }}>
      <div className="stack gap-16" style={{ alignItems: "center" }}>
        <h1 style={{ fontSize: "clamp(2rem, 7vw, 3rem)" }}>Something burned in the kitchen.</h1>
        <p className="muted">That did not load. Try again in a moment.</p>
        <button className="btn btn-ghost" onClick={() => reset()}>Try again</button>
      </div>
    </main>
  );
}
