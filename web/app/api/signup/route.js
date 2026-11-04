// Sign up with an invitation code. Public sign-ups are off in Supabase Auth; the account is made here with the admin
// API, and only after the code is spent. If anything after that fails, everything is undone and the code given back.
import { db, must } from "@/lib/db";
import { authClient } from "@/lib/auth";
import { body, fail, handle, json } from "@/lib/http";
import { normalizePhone } from "@/lib/phone";
import { validTimezone } from "@/lib/time";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function giveBack(code) {
  // use_invite added one; take it back (only if nobody else moved it since).
  const [inv] = await must(db.from("invites").select("uses").eq("code", code).limit(1));
  if (inv?.uses > 0) await db.from("invites").update({ uses: inv.uses - 1 }).eq("code", code).eq("uses", inv.uses);
}

export const POST = handle(async (req) => {
  const b = await body(req);
  if (!b) return fail(400, "Send JSON.");
  const code = String(b.code || "").trim().toUpperCase();
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  const name = String(b.restaurant || "").trim().slice(0, 120);
  const phone = normalizePhone(b.phone, b.country);
  const timezone = validTimezone(b.timezone) ? b.timezone : "America/New_York";

  if (!code) return fail(400, "Enter your invitation code.", { field: "code" });
  if (!EMAIL.test(email)) return fail(400, "Enter a valid email.", { field: "email" });
  if (password.length < 8) return fail(400, "Use a password with at least 8 characters.", { field: "password" });
  if (!name) return fail(400, "Enter your restaurant's name.", { field: "restaurant" });
  if (!phone) return fail(400, "Enter your WhatsApp number with its country code.", { field: "phone" });

  const { data: ok, error: inviteError } = await db.rpc("use_invite", { c: code });
  if (inviteError) throw new Error(inviteError.message);
  if (!ok) return fail(403, "That invitation code is not valid.", { field: "code" });

  const { data: created, error: userError } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (userError || !created?.user) {
    await giveBack(code);
    const taken = /already|registered|exists/i.test(userError?.message || "");
    return fail(taken ? 409 : 400, taken ? "There is already an account with this email. Sign in instead." : userError?.message || "Could not create the account.", { field: "email" });
  }
  const uid = created.user.id;
  let accountId = null;
  try {
    const [account] = await must(db.from("accounts").insert({ kind: "owner", name, user_id: uid, invite_code: code }).select("id"));
    accountId = account.id;
    const [restaurant] = await must(db.from("restaurants").insert({ account_id: accountId, name, timezone }).select("id"));
    await must(db.from("members").insert({ restaurant_id: restaurant.id, phone, role: "owner" }));
  } catch (e) {
    if (accountId) await db.from("accounts").delete().eq("id", accountId);
    await db.auth.admin.deleteUser(uid);
    await giveBack(code);
    throw e;
  }

  const supabase = await authClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return json({ ok: true, signedIn: false });
  return json({ ok: true, signedIn: true });
});
