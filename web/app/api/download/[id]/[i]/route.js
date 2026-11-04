// A full-quality download of one version: the link's k is checked, then a fresh 10-minute signed url.
import { NextResponse } from "next/server";
import { db, must, validKey, isUuid } from "@/lib/db";
import { fail, handle } from "@/lib/http";
import { fileName, signFull } from "@/lib/reels";

export const dynamic = "force-dynamic";

export const GET = handle(async (req, { params }) => {
  const { id, i: raw } = await params;
  const k = req.nextUrl.searchParams.get("k");
  if (!isUuid(id) || !validKey(id, k)) return fail(404, "Reel not found.");
  const [reel] = await must(db.from("reels").select("id, title, versions").eq("id", id).limit(1));
  const i = Number(raw), v = reel?.versions?.[i];
  if (!Number.isInteger(i) || !v?.path) return fail(404, "That version does not exist.");
  const url = await signFull(v.path, fileName(reel.title, v.register, i), 600);
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
});
