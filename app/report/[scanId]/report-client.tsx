"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getScanStatus, getRepoScanStatus } from "@/lib/api";
import { DashboardView } from "@/components/trust/dashboard-view";
import { Shield, Loader2 } from "lucide-react";
import type { ScanResult, RepoScanResult } from "@/lib/types";
import type { AppState } from "@/components/trust/client-app";
import { useSubscription } from "@/lib/subscription";

interface ReportClientProps {
  scanId: string;
}

export function ReportClient({ scanId }: ReportClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const subscription = useSubscription();

  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [repoScanResult, setRepoScanResult] = useState<RepoScanResult | null>(null);
  const [isRepoScan, setIsRepoScan] = useState(typeParam === "repo");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScan() {
      try {
        if (typeParam === "repo") {
          // Explicit repo type
          const result = await getRepoScanStatus(scanId);
          setRepoScanResult(result);
          setIsRepoScan(true);
        } else if (typeParam) {
          // Explicit URL type
          const result = await getScanStatus(scanId);
          setScanResult(result);
          setIsRepoScan(false);
        } else {
          // No type param — auto-detect by trying repo first, then URL
          try {
            const repoResult = await getRepoScanStatus(scanId);
            setRepoScanResult(repoResult);
            setIsRepoScan(true);
            // Update URL to include ?type=repo for future refreshes
            window.history.replaceState(null, "", `/report/${scanId}?type=repo`);
          } catch {
            // Not a repo scan — try URL scan
            const urlResult = await getScanStatus(scanId);
            setScanResult(urlResult);
            setIsRepoScan(false);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load report");
      } finally {
        setLoading(false);
      }
    }
    fetchScan();
  }, [scanId, typeParam]);

  const handleNewScan = () => {
    router.push("/");
  };

  const handleNavigate = (_state: AppState) => {
    router.push("/");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-neon-cyan animate-spin" />
          <p className="text-muted-foreground">Loading report...</p>
        </div>
      </main>
    );
  }

  if (error || (!scanResult && !repoScanResult)) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <div className="glass rounded-2xl p-8 text-center max-w-md">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-foreground mb-2">Report Not Found</h2>
          <p className="text-muted-foreground mb-4">
            {error || "This scan report does not exist or has expired."}
          </p>
          <button
            onClick={handleNewScan}
            className="px-4 py-2 bg-neon-cyan text-background rounded-lg hover:bg-neon-cyan/90 transition-colors font-medium"
          >
            Start New Scan
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background overflow-hidden relative">
      <div
        className="fixed inset-0 opacity-[0.02] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 243, 255, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 243, 255, 0.5) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] bg-neon-cyan/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-neon-cyan/3 rounded-full blur-[120px] pointer-events-none" />

      <DashboardView
        scanResult={isRepoScan ? null : scanResult}
        isRepoScan={isRepoScan}
        repoScanResult={isRepoScan ? repoScanResult : undefined}
        onNavigate={handleNavigate}
        onNewScan={handleNewScan}
        subscription={subscription}
      />
    </main>
  );
}
