"use client";
import { useState } from "react";

export default function LoginForm({ next = "/app", welcome = false }) {
  const [f, setF] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError(j.error || "Could not sign you in."); setBusy(false); return; }
      window.location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/app";
    } catch {
      setError("Could not reach Domi Reels. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      {welcome ? <div className="alert alert-good">Your account is ready. Sign in to start.</div> : null}
      <label className="field">
        <span className="field-label">Email</span>
        <input className="input" type="email" inputMode="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
      </label>
      <label className="field">
        <span className="field-label">Password</span>
        <input className="input" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
      </label>
      {error ? <div className="alert alert-bad" role="alert">{error}</div> : null}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
    </form>
  );
}
