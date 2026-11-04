import { NextResponse } from "next/server";
import { authClient } from "@/lib/auth";

export async function POST(req) {
  const supabase = await authClient();
  await supabase.auth.signOut().catch(() => {});
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
