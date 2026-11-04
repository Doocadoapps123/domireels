// Keeps the owner's Supabase session fresh: an expired access token is refreshed here, before the page or the route
// reads it, and the new cookies go back on the response. Only on the paths that need a session.
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.DR_SUPABASE_URL, process.env.DR_SUPABASE_PUBLISHABLE, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers || {})) response.headers.set(k, v);
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/api/app/:path*", "/login", "/signup"],
};
