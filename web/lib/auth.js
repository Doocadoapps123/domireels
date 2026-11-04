// Who is signed in. Supabase Auth keeps the session in cookies (@supabase/ssr); the publishable key is the only key
// this client ever holds. What the owner can see and change is then read with the secret key (lib/db.js), always
// scoped to the account the session belongs to.
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { db, must } from "./db";

export const RESTAURANT_COOKIE = "dr_r";

export async function authClient() {
  const store = await cookies();
  return createServerClient(process.env.DR_SUPABASE_URL, process.env.DR_SUPABASE_PUBLISHABLE, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // A server component cannot write cookies; the proxy (proxy.js) already refreshed the session.
        try { for (const { name, value, options } of list) store.set(name, value, options); } catch {}
      },
    },
  });
}

// The signed-in user's id, verified, or null.
export const userId = cache(async () => {
  const supabase = await authClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub;
});

// The owner's account, its restaurants, and the one they are looking at. null when nobody is signed in.
export const ownerContext = cache(async () => {
  const uid = await userId();
  if (!uid) return null;
  const [account] = await must(db.from("accounts").select("id, kind, name").eq("user_id", uid).limit(1));
  if (!account) return { uid, account: null, restaurants: [], restaurant: null };
  const restaurants = await must(db.from("restaurants").select("*").eq("account_id", account.id).order("created_at"));
  const store = await cookies();
  const want = store.get(RESTAURANT_COOKIE)?.value;
  const restaurant = restaurants.find((r) => r.id === want) || restaurants[0] || null;
  return { uid, account, restaurants, restaurant };
});

// For pages under /app: the context, or off to sign in.
export async function requireOwner() {
  const ctx = await ownerContext();
  if (!ctx) redirect("/login");
  return ctx;
}
