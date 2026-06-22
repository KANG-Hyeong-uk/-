"use client";

import type { RepoVulnType, VulnTier } from "@/lib/types";
import { VULN_TYPE_CONFIGS, TIER_CONFIGS } from "@/lib/types";
import { trackTierFilterClicked } from "@/lib/analytics";

interface TierCounts {
  "must-fix": number;
  "should-fix": number;
  "good-to-know": number;
}

interface FilterBarProps {
  isRepoScan: boolean;
  totalCount: number;
  filteredCount: number;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  repoVulnTypeFilter?: RepoVulnType | null;
  setRepoVulnTypeFilter?: (value: RepoVulnType | null) => void;
  tierFilter?: VulnTier | null;
  setTierFilter?: (value: VulnTier | null) => void;
  tierCounts?: TierCounts;
}

const tierButtons: { key: VulnTier; label: string }[] = [
  { key: "must-fix", label: "Must Fix" },
  { key: "should-fix", label: "Should Fix" },
  { key: "good-to-know", label: "Good to Know" },
];

export function FilterBar({
  isRepoScan,
  totalCount,
  filteredCount,
  searchQuery,
  setSearchQuery,
  repoVulnTypeFilter,
  setRepoVulnTypeFilter,
  tierFilter,
  setTierFilter,
  tierCounts,
}: FilterBarProps) {
  if (totalCount === 0) return null;

  const hasActiveFilters = isRepoScan
    ? !!(tierFilter || searchQuery || repoVulnTypeFilter)
    : !!(tierFilter || searchQuery);

  return (
    <div className="mb-4 space-y-3">
      {isRepoScan ? (
        /* Repo scan filters: type + tier */
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Vulnerability filters">
          <button
            onClick={() => { setRepoVulnTypeFilter?.(null); setTierFilter?.(null); trackTierFilterClicked(null); }}
            aria-pressed={!repoVulnTypeFilter && !tierFilter}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !repoVulnTypeFilter && !tierFilter
                ? "bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30"
                : "border border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
            }`}
          >
            All
          </button>
          {(["secret", "sast", "sca"] as RepoVulnType[]).map((type) => {
            const tc = VULN_TYPE_CONFIGS[type];
            const isActive = repoVulnTypeFilter === type;
            return (
              <button
                key={type}
                onClick={() => { setRepoVulnTypeFilter?.(isActive ? null : type); setTierFilter?.(null); }}
                aria-pressed={isActive}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? `${tc.bgColor} ${tc.color} border border-white/20`
                    : "border border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
                }`}
              >
                {tc.label}
              </button>
            );
          })}
          <span className="text-xs text-muted-foreground/50 mx-1">|</span>
          {tierButtons.map((btn) => {
            const isActive = tierFilter === btn.key;
            const config = TIER_CONFIGS[btn.key];
            const count = tierCounts?.[btn.key] ?? 0;
            return (
              <button
                key={btn.key}
                onClick={() => { const next = isActive ? null : btn.key; setTierFilter?.(next); trackTierFilterClicked(next); }}
                aria-pressed={isActive}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? `${config.bgColor} ${config.color} border ${config.borderColor}`
                    : "border border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
                }`}
              >
                {btn.label}
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/10" : config.bgColor} ${config.color}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        /* URL scan filters: tier tabs */
        <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Vulnerability tier filters">
          <button
            onClick={() => { setTierFilter?.(null); trackTierFilterClicked(null); }}
            aria-pressed={!tierFilter}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !tierFilter
                ? "bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30"
                : "border border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
            }`}
          >
            All
          </button>
          {tierButtons.map((btn) => {
            const isActive = tierFilter === btn.key;
            const config = TIER_CONFIGS[btn.key];
            const count = tierCounts?.[btn.key] ?? 0;
            return (
              <button
                key={btn.key}
                onClick={() => { const next = isActive ? null : btn.key; setTierFilter?.(next); trackTierFilterClicked(next); }}
                aria-pressed={isActive}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? `${config.bgColor} ${config.color} border ${config.borderColor}`
                    : "border border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
                }`}
              >
                {btn.label}
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/10" : config.bgColor} ${config.color}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {hasActiveFilters && (
        <p className="text-xs text-muted-foreground">
          Showing {filteredCount} of {totalCount} vulnerabilities
        </p>
      )}
    </div>
  );
}
