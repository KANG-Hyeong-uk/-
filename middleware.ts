import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // 1) Forward OAuth ?code= to the callback route (skip GitHub OAuth callback)
  if (
    pathname !== "/auth/callback" &&
    pathname !== "/auth/github-callback" &&
    searchParams.has("code") &&
    !searchParams.has("error")
  ) {
    const callbackUrl = new URL("/auth/callback", request.url);
    callbackUrl.search = request.nextUrl.search;
    return NextResponse.redirect(callbackUrl);
  }

  // 2) Refresh Supabase session on every request (official SSR pattern).
  //    This keeps auth cookies fresh and prevents stale-token issues.
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Update request cookies so downstream handlers see fresh values
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Rebuild the response so Set-Cookie headers are included
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() validates the JWT server-side and triggers a token refresh
  // if the access token is expired but the refresh token is still valid.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: ["/account/:path*", "/history/:path*"],
};
