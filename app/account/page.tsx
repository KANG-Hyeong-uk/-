import type { Metadata } from "next";
import { AccountClient } from "./account-client";

export const metadata: Metadata = {
  title: "Account | Gwangju Security",
  description: "Manage your Gwangju Security account, subscription, and billing.",
};

export default function AccountPage() {
  return <AccountClient />;
}
