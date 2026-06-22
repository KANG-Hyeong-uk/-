import type { Metadata } from "next";
import { AccountClient } from "./account-client";

export const metadata: Metadata = {
  title: "Account | Trust",
  description: "Manage your Trust account, subscription, and billing.",
};

export default function AccountPage() {
  return <AccountClient />;
}
