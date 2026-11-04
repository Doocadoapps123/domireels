import { authClient } from "@/lib/auth";
import { body, fail, handle, json } from "@/lib/http";

export const POST = handle(async (req) => {
  const b = await body(req);
  if (!b) return fail(400, "Send JSON.");
  const email = String(b.email || "").trim().toLowerCase(), password = String(b.password || "");
  if (!email || !password) return fail(400, "Enter your email and password.");
  const supabase = await authClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return fail(401, "That email and password do not match.");
  return json({ ok: true });
});
