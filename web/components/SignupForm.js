"use client";
import { useState } from "react";
import { COUNTRIES } from "@/lib/phone";

export default function SignupForm({ initialCode = "" }) {
  const [f, setF] = useState({ code: initialCode, restaurant: "", country: "1", phone: "", email: "", password: "" });
  const [error, setError] = useState({ msg: "", field: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError({ msg: "", field: "" });
    try {
      let timezone = "";
      try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
      const r = await fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, timezone }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setError({ msg: j.error || "Something went wrong.", field: j.field || "" }); setBusy(false); return; }
      window.location.href = j.signedIn ? "/app" : "/login?welcome=1";
    } catch {
      setError({ msg: "Could not reach Domi Reels. Check your connection and try again.", field: "" });
      setBusy(false);
    }
  }
  const bad = (k) => (error.field === k ? { "aria-invalid": true, style: { borderColor: "var(--bad)" } } : {});

  return (
    <form className="form" onSubmit={submit} noValidate>
      <label className="field">
        <span className="field-label">Invitation code</span>
        <input className="input input-code" value={f.code} onChange={set("code")} autoComplete="off" autoCapitalize="characters" spellCheck={false} required {...bad("code")} />
        <span className="field-hint">Domi Reels is by invitation only, so you need a code to sign up.</span>
      </label>
      <label className="field">
        <span className="field-label">Restaurant name</span>
        <input className="input" value={f.restaurant} onChange={set("restaurant")} autoComplete="organization" required {...bad("restaurant")} />
      </label>
      <div className="field">
        <span className="field-label">Your WhatsApp number</span>
        <div className="phone-input">
          <select className="select" value={f.country} onChange={set("country")} aria-label="Country code">
            {COUNTRIES.map(([cc, name]) => <option key={`${cc}-${name}`} value={cc}>+{cc} {name}</option>)}
          </select>
          <input className="input" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="407 555 1234" autoComplete="tel-national" required {...bad("phone")} />
        </div>
        <span className="field-hint">Your Reels arrive here, and Muse asks you its questions here.</span>
      </div>
      <label className="field">
        <span className="field-label">Email</span>
        <input className="input" type="email" inputMode="email" value={f.email} onChange={set("email")} autoComplete="email" required {...bad("email")} />
      </label>
      <label className="field">
        <span className="field-label">Password</span>
        <input className="input" type="password" value={f.password} onChange={set("password")} autoComplete="new-password" minLength={8} required {...bad("password")} />
        <span className="field-hint">At least 8 characters.</span>
      </label>
      {error.msg ? <div className="alert alert-bad" role="alert">{error.msg}</div> : null}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "Setting up your kitchen..." : "Create my account"}</button>
    </form>
  );
}
