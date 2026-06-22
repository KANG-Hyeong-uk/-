import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportClient } from "./report-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

interface ReportPageProps {
  params: Promise<{ scanId: string }>;
  searchParams: Promise<{ type?: string }>;
}

export async function generateMetadata({ params, searchParams }: ReportPageProps): Promise<Metadata> {
  const { scanId } = await params;
  const { type } = await searchParams;
  const isRepo = type === "repo";

  try {
    const endpoint = isRepo ? `/api/repo-scan/${scanId}` : `/api/scan/${scanId}`;
    const res = await fetch(`${API_URL}${endpoint}`, {
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return {
        title: "Gwangju Security Report",
        description: "AI-powered security scan report",
      };
    }

    const data = await res.json();
    const grade = data.grade || "?";
    const score = data.score ?? "?";
    const target = isRepo ? (data.repo_name || data.repo_url || "Unknown") : (data.target_url || "Unknown");
    const totalVulns = data.vulnerabilities?.length ?? 0;
    const prefix = isRepo ? "Repo Scan" : "Security Scan";

    return {
      title: `Gwangju Security ${prefix} Report - Grade ${grade} (${score}/100)`,
      description: `${prefix} for ${target}: Grade ${grade}, Score ${score}/100, ${totalVulns} findings detected.`,
      openGraph: {
        title: `Gwangju Security ${prefix} Report - Grade ${grade} (${score}/100)`,
        description: `${prefix} for ${target}: Grade ${grade}, Score ${score}/100, ${totalVulns} findings detected.`,
        type: "website",
      },
    };
  } catch {
    return {
      title: "Gwangju Security Report",
      description: "AI-powered security scan report",
    };
  }
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { scanId } = await params;
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    }>
      <ReportClient scanId={scanId} />
    </Suspense>
  );
}
