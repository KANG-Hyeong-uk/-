"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function HistoryClient() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <p className="text-muted-foreground mb-4">Scan history is disabled in local mode.</p>
        <Link href="/" className="flex items-center gap-2 text-neon-cyan hover:underline justify-center">
          <ArrowLeft className="w-4 h-4" />
          Back to scanner
        </Link>
      </div>
    </div>
  );
}
