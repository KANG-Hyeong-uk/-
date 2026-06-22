import { ClientApp } from "@/components/trust/client-app";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 600;

export type LiveStats = {
  scans: number;
  vulns: number;
} | null;

async function getLiveStats(): Promise<LiveStats> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const [urlScans, repoScans, urlVulns, repoVulns] = await Promise.all([
    supabase.from("scans").select("*", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("repo_scans").select("*", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("vulnerabilities").select("*", { count: "exact", head: true }),
    supabase.from("repo_vulnerabilities").select("*", { count: "exact", head: true }),
  ]);

  if (urlScans.error || repoScans.error || urlVulns.error || repoVulns.error) return null;

  return {
    scans: (urlScans.count ?? 0) + (repoScans.count ?? 0),
    vulns: (urlVulns.count ?? 0) + (repoVulns.count ?? 0),
  };
}

export default async function Home() {
  const liveStats = await getLiveStats();
  return <ClientApp liveStats={liveStats} />;
}
