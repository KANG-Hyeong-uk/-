"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "@posthog/react";
import { useEffect, Suspense } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase";
import type { User as SupabaseUser, Session } from "@supabase/supabase-js";

const POSTHOG_KEY = "phc_TYuZ5vhX2TTcufEZ6PFivzQaoysNGovETLtNOjgbKCf";
const POSTHOG_HOST = "https://us.i.posthog.com";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false, // we handle manually for SPA
      capture_pageleave: true,
      autocapture: true,
      persistence: "localStorage+cookie",
    });
  }, []);

  // Identify logged-in users
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: SupabaseUser | null } }) => {
      if (user) {
        posthog.identify(user.id, {
          email: user.email,
          github_username: user.user_metadata?.user_name,
        });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      if (session?.user) {
        posthog.identify(session.user.id, {
          email: session.user.email,
          github_username: session.user.user_metadata?.user_name,
        });
      } else {
        posthog.reset();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      {children}
    </PHProvider>
  );
}

/** Track pageviews on route change for Next.js App Router SPA navigation */
function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (pathname && ph) {
      let url = window.origin + pathname;
      const search = searchParams.toString();
      if (search) url += `?${search}`;
      ph.capture("$pageview", { $current_url: url });
    }
  }, [pathname, searchParams, ph]);

  return null;
}
