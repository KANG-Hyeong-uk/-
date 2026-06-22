import type { Metadata } from "next";
import { HistoryClient } from "./history-client";

export const metadata: Metadata = {
  title: "Scan History | Trust",
  description: "View the security score history and trends for all your previously scanned sites.",
};

export default function HistoryPage() {
  return <HistoryClient />;
}
