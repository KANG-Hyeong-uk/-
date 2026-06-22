"use client";

// Upgrade modal disabled in local mode — auth removed
export function UpgradeModal({ open, onClose }: {
  open: boolean;
  onClose: () => void;
  trigger?: string;
  urlScansUsed?: number;
  urlScansLimit?: number;
  repoScansUsed?: number;
  repoScansLimit?: number;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="glass rounded-2xl border border-neon-cyan/20 max-w-sm w-full mx-4 p-6 text-center">
        <p className="text-foreground mb-4">Upgrade not available in local mode.</p>
        <button onClick={onClose} className="text-neon-cyan hover:underline text-sm">Close</button>
      </div>
    </div>
  );
}
