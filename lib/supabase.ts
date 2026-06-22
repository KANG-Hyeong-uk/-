import { createBrowserClient } from "@supabase/ssr";

// Singleton: ensure only one GoTrueClient instance exists in the browser.
// Multiple instances cause Web Locks contention, which can hang signOut().
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return browserClient;
}
