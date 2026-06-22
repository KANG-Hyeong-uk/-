/**
 * Tests for AccountClient component (/account page).
 *
 * Covers:
 * 1. Loading state → spinner
 * 2. Not logged in → sign-in prompt
 * 3. Free user → profile, Free Plan, upgrade button, usage, delete enabled
 * 4. Pro monthly user → Pro Monthly label, Manage Billing, renewal date
 * 5. Pro yearly user with cancel_at_period_end → cancellation notice
 * 6. Delete button → confirmation modal behavior
 * 7. Active subscription → delete modal shows blocking message
 * 8. API calls: Manage Billing, Delete Account
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AccountClient } from "@/app/account/account-client";

// ---------- Mocks ----------

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

// Mock useSubscription
const mockSubscription = {
  plan: null as string | null,
  loading: true,
  user: null as Record<string, unknown> | null,
  accessToken: null as string | null,
  urlScansUsed: 0,
  urlScansLimit: 5,
  repoScansUsed: 0,
  repoScansLimit: 3,
  refresh: vi.fn(),
};
vi.mock("@/lib/subscription", () => ({
  useSubscription: () => mockSubscription,
}));

// Mock Supabase client
const mockSupabaseFrom = vi.fn();
vi.mock("@/lib/supabase", () => ({
  createClient: () => ({
    from: mockSupabaseFrom,
  }),
}));

// Mock API calls
const mockCreateCustomerPortal = vi.fn();
const mockDeleteAccount = vi.fn();
vi.mock("@/lib/api", () => ({
  createCustomerPortal: (...args: unknown[]) => mockCreateCustomerPortal(...args),
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
}));

// Mock UpgradeModal (just render a stub)
vi.mock("@/components/trust/UpgradeModal", () => ({
  UpgradeModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="upgrade-modal">UpgradeModal</div> : null,
}));

// Mock ProviderPicker
vi.mock("@/components/trust/ProviderPicker", () => ({
  ProviderPicker: ({ open }: { open: boolean }) =>
    open ? <div data-testid="provider-picker">ProviderPicker</div> : null,
}));

// ---------- Helpers ----------

function setSubscription(overrides: Partial<typeof mockSubscription>) {
  Object.assign(mockSubscription, overrides);
}

function fakeUser(plan: "free" | "pro" = "free") {
  return {
    id: "user-123",
    email: "jaden@trust-scan.me",
    created_at: "2026-03-01T00:00:00Z",
    app_metadata: { provider: "github" },
    user_metadata: {
      avatar_url: "https://avatars.example.com/jaden.png",
      user_name: "jaden",
      full_name: "Jaden",
    },
    identities: [{ provider: "github" }],
  };
}

function setupSupabaseSubscriptionQuery(data: Record<string, unknown> | null) {
  mockSupabaseFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data, error: null }),
      }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to loading
  Object.assign(mockSubscription, {
    plan: null,
    loading: true,
    user: null,
    accessToken: null,
    urlScansUsed: 0,
    urlScansLimit: 5,
    repoScansUsed: 0,
    repoScansLimit: 3,
  });
  setupSupabaseSubscriptionQuery(null);
});

// ---------- Tests ----------

describe("AccountClient", () => {
  // ── 1. Loading state ──
  it("shows spinner while loading", () => {
    setSubscription({ loading: true });
    render(<AccountClient />);
    // Should have the loading spinner (Loader2 icon has animate-spin)
    const spinner = document.querySelector(".animate-spin");
    expect(spinner).toBeTruthy();
  });

  // ── 2. Not logged in ──
  it("shows sign-in prompt when not logged in", async () => {
    setSubscription({ loading: false, user: null, plan: null });
    render(<AccountClient />);

    expect(screen.getByText("Sign in to manage your account")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("opens ProviderPicker when Sign in clicked", async () => {
    setSubscription({ loading: false, user: null, plan: null });
    render(<AccountClient />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByTestId("provider-picker")).toBeInTheDocument();
  });

  // ── 3. Free user ──
  it("renders free user profile correctly", async () => {
    setSubscription({
      loading: false,
      user: fakeUser("free") as any,
      plan: "free",
      accessToken: "tok-123",
      urlScansUsed: 3,
      urlScansLimit: 5,
      repoScansUsed: 1,
      repoScansLimit: 3,
    });
    setupSupabaseSubscriptionQuery(null);

    render(<AccountClient />);

    await waitFor(() => {
      // Profile
      expect(screen.getByText("jaden@trust-scan.me")).toBeInTheDocument();
      expect(screen.getByText(/Signed in with GitHub/)).toBeInTheDocument();
      expect(screen.getByText(/Member since/)).toBeInTheDocument();

      // Free Plan
      expect(screen.getByText("Free Plan")).toBeInTheDocument();

      // Upgrade button (not Manage Billing)
      expect(screen.getByRole("button", { name: /Upgrade to Pro/ })).toBeInTheDocument();
    });
  });

  it("shows correct usage for free user", async () => {
    setSubscription({
      loading: false,
      user: fakeUser("free") as any,
      plan: "free",
      accessToken: "tok-123",
      urlScansUsed: 3,
      urlScansLimit: 5,
      repoScansUsed: 1,
      repoScansLimit: 3,
    });
    setupSupabaseSubscriptionQuery(null);

    render(<AccountClient />);

    await waitFor(() => {
      expect(screen.getByText("3 / 5")).toBeInTheDocument();
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });
  });

  it("opens UpgradeModal when Upgrade to Pro clicked", async () => {
    setSubscription({
      loading: false,
      user: fakeUser("free") as any,
      plan: "free",
      accessToken: "tok-123",
    });
    setupSupabaseSubscriptionQuery(null);

    render(<AccountClient />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Upgrade to Pro/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Upgrade to Pro/ }));
    expect(screen.getByTestId("upgrade-modal")).toBeInTheDocument();
  });

  // ── 4. Pro monthly user ──
  it("renders Pro Monthly user correctly", async () => {
    setSubscription({
      loading: false,
      user: fakeUser("pro") as any,
      plan: "pro",
      accessToken: "tok-pro",
      urlScansUsed: 15,
      urlScansLimit: Infinity,
      repoScansUsed: 8,
      repoScansLimit: Infinity,
    });
    setupSupabaseSubscriptionQuery({
      plan: "pro_monthly",
      status: "active",
      current_period_end: "2026-05-13T00:00:00Z",
      cancel_at_period_end: false,
    });

    render(<AccountClient />);

    await waitFor(() => {
      expect(screen.getByText("Pro Monthly")).toBeInTheDocument();
      expect(screen.getByText("ACTIVE")).toBeInTheDocument();
      expect(screen.getByText(/May 13, 2026/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Manage Billing/ })).toBeInTheDocument();
    });
  });

  it("shows unlimited usage for pro user", async () => {
    setSubscription({
      loading: false,
      user: fakeUser("pro") as any,
      plan: "pro",
      accessToken: "tok-pro",
      urlScansUsed: 15,
      urlScansLimit: Infinity,
      repoScansUsed: 8,
      repoScansLimit: Infinity,
    });
    setupSupabaseSubscriptionQuery({
      plan: "pro_monthly",
      status: "active",
      current_period_end: "2026-05-13T00:00:00Z",
      cancel_at_period_end: false,
    });

    render(<AccountClient />);

    await waitFor(() => {
      expect(screen.getByText("15 / ∞")).toBeInTheDocument();
      expect(screen.getByText("8 / ∞")).toBeInTheDocument();
    });
  });

  // ── 5. Canceling subscription ──
  it("shows cancellation notice when cancel_at_period_end", async () => {
    setSubscription({
      loading: false,
      user: fakeUser("pro") as any,
      plan: "pro",
      accessToken: "tok-pro",
      urlScansUsed: 0,
      urlScansLimit: Infinity,
      repoScansUsed: 0,
      repoScansLimit: Infinity,
    });
    setupSupabaseSubscriptionQuery({
      plan: "pro_yearly",
      status: "active",
      current_period_end: "2026-12-01T00:00:00Z",
      cancel_at_period_end: true,
    });

    render(<AccountClient />);

    await waitFor(() => {
      expect(screen.getByText(/Cancels on/)).toBeInTheDocument();
      expect(screen.getByText(/keep using Pro until then/)).toBeInTheDocument();
    });
  });

  // ── 6. Delete button → confirmation modal ──
  it("opens delete confirmation modal", async () => {
    setSubscription({
      loading: false,
      user: fakeUser("free") as any,
      plan: "free",
      accessToken: "tok-123",
    });
    setupSupabaseSubscriptionQuery(null);

    render(<AccountClient />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Delete Account/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /Delete Account/i }));

    // Modal should appear
    expect(screen.getByText(/permanent and irreversible/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type DELETE")).toBeInTheDocument();
  });

  it("delete confirm button disabled until DELETE typed", async () => {
    setSubscription({
      loading: false,
      user: fakeUser("free") as any,
      plan: "free",
      accessToken: "tok-123",
    });
    setupSupabaseSubscriptionQuery(null);

    render(<AccountClient />);

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: /Delete Account/i }));
    });

    // The confirm button inside modal
    const confirmButtons = screen.getAllByRole("button", { name: /Delete Account/i });
    const confirmBtn = confirmButtons[confirmButtons.length - 1]; // The one inside the modal
    expect(confirmBtn).toBeDisabled();

    // Type DELETE
    fireEvent.change(screen.getByPlaceholderText("Type DELETE"), {
      target: { value: "DELETE" },
    });
    expect(confirmBtn).not.toBeDisabled();
  });

  // ── 7. Active subscription → delete modal shows blocking message ──
  it("delete modal shows blocking message for active subscription", async () => {
    setSubscription({
      loading: false,
      user: fakeUser("pro") as any,
      plan: "pro",
      accessToken: "tok-pro",
    });
    setupSupabaseSubscriptionQuery({
      plan: "pro_monthly",
      status: "active",
      current_period_end: "2026-05-13T00:00:00Z",
      cancel_at_period_end: false,
    });

    render(<AccountClient />);

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: /Delete Account/i }));
    });

    expect(screen.getByText(/cancel your subscription first/i)).toBeInTheDocument();
    // Should NOT have the DELETE input
    expect(screen.queryByPlaceholderText("Type DELETE")).not.toBeInTheDocument();
  });

  // ── 8. API calls ──
  it("calls createCustomerPortal on Manage Billing click", async () => {
    mockCreateCustomerPortal.mockResolvedValue({
      portal_url: "https://customer-portal.paddle.com/session123",
    });

    // Mock window.location.href assignment
    const locationHref = vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      href: "http://localhost:3847/account",
    } as Location);

    setSubscription({
      loading: false,
      user: fakeUser("pro") as any,
      plan: "pro",
      accessToken: "tok-pro",
    });
    setupSupabaseSubscriptionQuery({
      plan: "pro_monthly",
      status: "active",
      current_period_end: "2026-05-13T00:00:00Z",
      cancel_at_period_end: false,
    });

    render(<AccountClient />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Manage Billing/ })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Manage Billing/ }));
    });

    expect(mockCreateCustomerPortal).toHaveBeenCalledWith("tok-pro");
    locationHref.mockRestore();
  });

  it("calls deleteAccount API on confirmed deletion", async () => {
    mockDeleteAccount.mockResolvedValue({ status: "deleted" });

    setSubscription({
      loading: false,
      user: fakeUser("free") as any,
      plan: "free",
      accessToken: "tok-123",
    });
    setupSupabaseSubscriptionQuery(null);

    render(<AccountClient />);

    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: /Delete Account/i }));
    });

    // Type DELETE
    fireEvent.change(screen.getByPlaceholderText("Type DELETE"), {
      target: { value: "DELETE" },
    });

    // Click confirm
    const confirmButtons = screen.getAllByRole("button", { name: /Delete Account/i });
    const confirmBtn = confirmButtons[confirmButtons.length - 1];

    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    expect(mockDeleteAccount).toHaveBeenCalledWith("tok-123");
  });

  // ── Footer links ──
  it("renders Terms and Privacy links", async () => {
    setSubscription({
      loading: false,
      user: fakeUser("free") as any,
      plan: "free",
      accessToken: "tok-123",
    });
    setupSupabaseSubscriptionQuery(null);

    render(<AccountClient />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
      expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    });
  });

  // ── Google provider ──
  it("shows Google provider correctly", async () => {
    const googleUser = {
      ...fakeUser("free"),
      app_metadata: { provider: "google" },
      identities: [{ provider: "google" }],
    };
    setSubscription({
      loading: false,
      user: googleUser as any,
      plan: "free",
      accessToken: "tok-123",
    });
    setupSupabaseSubscriptionQuery(null);

    render(<AccountClient />);

    await waitFor(() => {
      expect(screen.getByText(/Signed in with Google/)).toBeInTheDocument();
    });
  });

  // ── Contact support ──
  it("has contact support link", async () => {
    setSubscription({
      loading: false,
      user: fakeUser("free") as any,
      plan: "free",
      accessToken: "tok-123",
    });
    setupSupabaseSubscriptionQuery(null);

    render(<AccountClient />);

    await waitFor(() => {
      const link = screen.getByRole("link", { name: /Contact Support/ });
      expect(link).toHaveAttribute("href", "mailto:contact@trust-scan.me");
    });
  });
});
