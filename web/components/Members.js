"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { COUNTRIES, prettyPhone } from "@/lib/phone";

export default function Members({ restaurantId, members }) {
  const router = useRouter();
  const [f, setF] = useState({ country: "1", phone: "", name: "", role: "staff" });
  const [state, setState] = useState({ busy: false, msg: "", bad: false });

  async function call(method, body) {
    setState({ busy: true, msg: "", bad: false });
    try {
      const r = await fetch("/api/app/members", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ restaurant_id: restaurantId, ...body }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong.");
      setState({ busy: false, msg: "", bad: false });
      return true;
    } catch (e) {
      setState({ busy: false, msg: e.message, bad: true });
      return false;
    }
  }

  return (
    <div className="card card-lg stack gap-16">
      <div className="stack gap-4">
        <span className="panel-title">Who can talk to Domi Reels</span>
        <span className="small muted">Only these WhatsApp numbers get an answer, get the Reels, and can send photos and voice notes for this restaurant.</span>
      </div>
      <div className="stack gap-8">
        {members.map((m) => (
          <div className="member" key={m.id}>
            <div className="stack" style={{ minWidth: 0 }}>
              <strong>{prettyPhone(m.phone)}</strong>
              <span className="small dim">{[m.name, m.role === "owner" ? "Owner" : "Team"].filter(Boolean).join(", ")}</span>
            </div>
            <button className="btn btn-danger btn-sm" disabled={state.busy || members.length < 2} title={members.length < 2 ? "Keep at least one number" : ""}
              onClick={async () => { if (confirm(`Remove ${prettyPhone(m.phone)}?`) && (await call("DELETE", { id: m.id }))) router.refresh(); }}>
              Remove
            </button>
          </div>
        ))}
      </div>
      <form className="form" onSubmit={async (e) => {
        e.preventDefault();
        if (await call("POST", f)) { setF({ ...f, phone: "", name: "" }); router.refresh(); }
      }}>
        <span className="field-label">Add a number</span>
        <div className="phone-input">
          <select className="select" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} aria-label="Country code">
            {COUNTRIES.map(([cc, name]) => <option key={`${cc}-${name}`} value={cc}>+{cc} {name}</option>)}
          </select>
          <input className="input" type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="407 555 1234" aria-label="WhatsApp number" required />
        </div>
        <div className="grid-2">
          <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name (optional)" aria-label="Name" maxLength={80} />
          <select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} aria-label="Role">
            <option value="staff">Team</option>
            <option value="owner">Owner</option>
          </select>
        </div>
        {state.msg ? <div className={`alert ${state.bad ? "alert-bad" : "alert-good"}`}>{state.msg}</div> : null}
        <button className="btn btn-ghost" disabled={state.busy || !f.phone.trim()}>Add number</button>
      </form>
    </div>
  );
}
