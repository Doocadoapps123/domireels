// Small helpers shared by the route handlers.
import "server-only";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db, must } from "./db";
import { ownerContext } from "./auth";

export const json = (body, status = 200, headers) => NextResponse.json(body, { status, headers });
export const fail = (status, error, extra) => json({ error, ...extra }, status);

// The JSON body, or null when it is not JSON. Requiring JSON also keeps other sites from posting forms here.
export async function body(req) {
  if (!(req.headers.get("content-type") || "").includes("application/json")) return null;
  try { return await req.json(); } catch { return null; }
}

// For /api/app routes: the signed-in owner and the restaurant they named, checked against their account.
export async function ownerFor(restaurantId) {
  const ctx = await ownerContext();
  if (!ctx?.account) return { error: fail(401, "Sign in first.") };
  const restaurant = restaurantId ? ctx.restaurants.find((r) => r.id === restaurantId) : ctx.restaurant;
  if (!restaurant) return { error: fail(404, "Restaurant not found.") };
  return { ctx, restaurant };
}

// For /api/v1: the platform account whose key this is.
export async function platformFor(req) {
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(\S+)$/i);
  if (!m) return { error: fail(401, "Missing API key. Send Authorization: Bearer <key>.") };
  const hash = crypto.createHash("sha256").update(m[1]).digest("hex");
  const [account] = await must(db.from("accounts").select("id, name, kind").eq("api_key_hash", hash).eq("kind", "platform").limit(1));
  if (!account) return { error: fail(401, "Invalid API key.") };
  return { account };
}

// Wraps a handler so an unexpected error answers 500 in JSON instead of an HTML page.
export const handle = (fn) => async (...args) => {
  try { return await fn(...args); }
  catch (e) {
    console.error(e);
    return fail(500, "Something went wrong on our side. Try again in a moment.");
  }
};
