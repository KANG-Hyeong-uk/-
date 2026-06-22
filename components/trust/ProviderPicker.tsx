"use client";

// Auth removed
export function ProviderPicker({ open, onClose }: { open: boolean; onClose: () => void; pendingIntent?: unknown }) {
  if (!open) return null;
  onClose();
  return null;
}

export async function signInDirect() {}
