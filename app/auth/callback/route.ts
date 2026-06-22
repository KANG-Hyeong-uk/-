import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Read redirect target: prefer query param, fall back to cookie
  let next = searchParams.get("next") ?? "/";

  if (code) {
    const cookieStore = await cookies();

    // Check cookie for redirect path (set by AuthButton before OAuth)
    const redirectCookie = cookieStore.get("auth_redirect");
    if (redirectCookie?.value) {
      next = decodeURIComponent(redirectCookie.value);
    }

    // Validate redirect path: only allow safe relative paths
    if (
      !next.startsWith("/") ||
      next.startsWith("//") ||
      next.includes(":\\") ||
      next.includes("@")
    ) {
      next = "/";
    }

    // Create the redirect response FIRST so setAll writes cookies directly
    // onto it. Using cookieStore.set() + separate NextResponse.redirect()
    // can lose Set-Cookie headers in Next.js 16.
    const response = NextResponse.redirect(`${origin}${next}`);
    response.cookies.set("auth_redirect", "", { path: "/", maxAge: 0 });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return response;
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth_failed`);
}
