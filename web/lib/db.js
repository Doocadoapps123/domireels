// The web app's only door to the database: the secret key, on the server only. Every table is private (RLS on, no
// policies, supabase/migrations/0001_init.sql), so the browser never talks to them. Mirrors src/server/db.mjs.
import "server-only";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const db = createClient(process.env.DR_SUPABASE_URL, process.env.DR_SUPABASE_SECRET, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// A query's rows, or its error thrown.
export const must = async (q) => {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
};

export async function upload(bucket, path, body, contentType) {
  const { error } = await db.storage.from(bucket).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
  return path;
}

export async function signed(bucket, path, seconds = 3600, options) {
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, seconds, options);
  if (error) throw new Error(`sign ${bucket}/${path}: ${error.message}`);
  return data.signedUrl;
}

// Many at once, in one call. Returns a map path -> url (missing files are left out).
export async function signedMany(bucket, paths, seconds = 3600) {
  const list = [...new Set(paths.filter(Boolean))];
  if (!list.length) return {};
  const { data, error } = await db.storage.from(bucket).createSignedUrls(list, seconds);
  if (error) throw new Error(`sign ${bucket}: ${error.message}`);
  return Object.fromEntries(data.filter((d) => d.signedUrl && !d.error).map((d) => [d.path, d.signedUrl]));
}

export const publicUrl = (bucket, path) => db.storage.from(bucket).getPublicUrl(path).data.publicUrl;

// The owner's links never expire and never expose storage: the page checks this signature and signs a fresh url.
// Same HMAC as src/server/db.mjs, so a link the worker sends on WhatsApp opens here.
export const linkKey = (id) =>
  crypto.createHmac("sha256", process.env.DR_LINK_SECRET).update(String(id)).digest("base64url").slice(0, 22);

export const reelLink = (reelId) => `${process.env.DR_PUBLIC_URL}/r/${reelId}?k=${linkKey(reelId)}`;

// Constant-time check of a link key.
export function validKey(id, k) {
  if (typeof k !== "string" || !id) return false;
  const a = Buffer.from(linkKey(id)), b = Buffer.from(k);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export const isUuid = (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
