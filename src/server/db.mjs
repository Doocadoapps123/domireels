// The server's only door to the database: the secret key, never in a browser. Every table is private (supabase/migrations).
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const db = createClient(process.env.DR_SUPABASE_URL, process.env.DR_SUPABASE_SECRET, { auth: { persistSession: false } });

// A query's rows, or its error thrown.
export const must = async (q) => { const { data, error } = await q; if (error) throw new Error(error.message); return data; };

export async function upload(bucket, path, body, contentType) {
  const { error } = await db.storage.from(bucket).upload(path, body, { contentType, upsert: true });
  if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
  return path;
}
export async function signed(bucket, path, seconds = 3600) {
  const { data, error } = await db.storage.from(bucket).createSignedUrl(path, seconds);
  if (error) throw new Error(`sign ${bucket}/${path}: ${error.message}`);
  return data.signedUrl;
}
export const publicUrl = (bucket, path) => db.storage.from(bucket).getPublicUrl(path).data.publicUrl;

// The owner's links never expire and never expose storage: the web app checks this signature and signs a fresh url.
export const linkKey = (id) => crypto.createHmac("sha256", process.env.DR_LINK_SECRET).update(id).digest("base64url").slice(0, 22);
export const reelLink = (reelId) => `${process.env.DR_PUBLIC_URL}/r/${reelId}?k=${linkKey(reelId)}`;
