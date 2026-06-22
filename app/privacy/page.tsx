import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FadeIn } from "@/components/ui/fade-in";

export const metadata: Metadata = {
  title: "Privacy Policy | Trust Security",
  description: "Trust Security Privacy Policy",
};

const LAST_UPDATED = "February 19, 2026";
const CONTACT_EMAIL = "contact@trust-scan.me";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-white/8 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Trust
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <FadeIn>
          <div className="mb-10">
            <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
            <p className="text-muted-foreground text-sm">
              Last updated: {LAST_UPDATED}
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.15} className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <p className="text-foreground">
            Trust Security (&quot;Trust&quot;, &quot;we&quot;, &quot;our&quot;) is committed to protecting
            your personal information. This Privacy Policy explains what data we
            collect, how we use it, and your rights regarding that data.
          </p>

          <Section title="1. Information We Collect">
            <div className="space-y-2">
              <Row
                label="Email address"
                value="Collected automatically via GitHub OAuth when you sign in."
              />
              <Row
                label="GitHub username"
                value="Collected automatically via GitHub OAuth when you sign in."
              />
              <Row
                label="Scan targets"
                value="URLs or repository addresses you submit for scanning."
              />
              <Row
                label="Scan results"
                value="Vulnerability findings generated when a scan runs."
              />
              <Row
                label="Payment information"
                value="Handled directly by Paddle. Trust never stores card numbers or billing details."
              />
              <Row
                label="Service logs"
                value="Error logs and aggregate usage metrics for debugging and improvement (no IP addresses)."
              />
            </div>
          </Section>

          <Section title="2. How We Use Your Information">
            <ul className="space-y-1.5 list-disc list-inside">
              <li>Providing and personalizing the Service.</li>
              <li>Storing and displaying your scan history.</li>
              <li>Managing your subscription and processing payments via Paddle.</li>
              <li>
                Sending scheduled scan results and service notifications by
                email (Pro plan).
              </li>
              <li>Diagnosing bugs and improving the Service.</li>
            </ul>
          </Section>

          <Section title="3. Third-Party Services">
            <p className="mb-3">
              We share data only with the following sub-processors, to the
              extent necessary to provide the Service:
            </p>
            <div className="space-y-2">
              {[
                {
                  name: "Supabase",
                  desc: "Database, authentication, and file storage. Servers in the United States.",
                  link: "https://supabase.com/privacy",
                },
                {
                  name: "Paddle",
                  desc: "Payment processing and subscription management. Acts as Merchant of Record and manages all billing data directly.",
                  link: "https://www.paddle.com/legal/privacy",
                },
                {
                  name: "Resend",
                  desc: "Transactional email delivery (notifications, scheduled scan results).",
                  link: "https://resend.com/privacy",
                },
                {
                  name: "Vercel",
                  desc: "Frontend hosting and edge delivery.",
                  link: "https://vercel.com/legal/privacy-policy",
                },
                {
                  name: "Google Cloud Run",
                  desc: "Backend API hosting in the asia-northeast3 (Seoul) region.",
                  link: "https://cloud.google.com/terms/cloud-privacy-notice",
                },
              ].map(({ name, desc, link }) => (
                <div
                  key={name}
                  className="glass rounded-lg p-3 border border-white/8"
                >
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground font-medium text-xs hover:text-neon-cyan transition-colors"
                  >
                    {name} ↗
                  </a>
                  <p className="mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-3">
              We do not sell your personal data or share it with third parties
              for marketing purposes.
            </p>
          </Section>

          <Section title="4. Data Retention">
            <div className="space-y-2">
              <Row label="Account information" value="Until you request deletion." />
              <Row
                label="Scan history"
                value="12 months from your last activity."
              />
              <Row
                label="Payment records"
                value="5 years, as required by law."
              />
              <Row label="Service logs" value="90 days." />
            </div>
          </Section>

          <Section title="5. Security">
            <p>
              We protect your data using HTTPS encryption in transit, Supabase
              Row Level Security (RLS) to enforce per-user data isolation, and
              regular security reviews. No method of transmission or storage is
              100% secure; we cannot guarantee absolute security.
            </p>
          </Section>

          <Section title="6. Your Rights">
            <p className="mb-3">
              Depending on your jurisdiction, you may have the right to:
            </p>
            <ul className="space-y-1.5 list-disc list-inside">
              <li>Access the personal data we hold about you.</li>
              <li>Correct inaccurate data.</li>
              <li>Delete your account and associated data.</li>
              <li>Restrict or object to certain processing.</li>
              <li>Receive your data in a portable format (JSON export).</li>
              <li>
                Withdraw consent (where processing is based on consent).
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-neon-cyan hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              . We will respond within 7 business days.
            </p>
          </Section>

          <Section title="7. Cookies and Local Storage">
            <p>
              We use essential cookies and browser local storage solely to
              maintain your authenticated session. We do not use tracking or
              advertising cookies. We use{" "}
              <span className="text-foreground">Vercel Analytics</span> for
              anonymous, aggregate traffic analysis with no personally
              identifiable information.
            </p>
          </Section>

          <Section title="8. Children's Privacy">
            <p>
              The Service is not directed to children under 14. If we become
              aware that we have collected personal information from a child
              under 14, we will delete it promptly. Contact us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-neon-cyan hover:underline"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              if you believe this has occurred.
            </p>
          </Section>

          <Section title="9. International Transfers">
            <p>
              Your data may be transferred to and processed in countries outside
              your own, including the United States. We rely on Supabase&apos;s and
              our sub-processors&apos; data processing agreements to provide
              appropriate safeguards for such transfers.
            </p>
          </Section>

          <Section title="10. Changes to This Policy">
            <p>
              We will notify you of material changes by email or in-app notice
              at least 7 days before they take effect. The &quot;Last updated&quot; date
              at the top of this page always reflects the current version.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>Questions or requests regarding this policy:</p>
            <div className="mt-3 glass rounded-xl p-4 border border-white/8">
              <p className="text-foreground font-medium">Trust Security</p>
              <p className="mt-1">
                Email:{" "}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="text-neon-cyan hover:underline"
                >
                  {CONTACT_EMAIL}
                </a>
              </p>
              <p className="mt-0.5">Website: trust-scan.me</p>
            </div>
          </Section>
        </FadeIn>
      </main>

      <footer className="border-t border-white/8 mt-10 py-8 text-center text-xs text-muted-foreground">
        <div className="flex justify-center gap-6">
          <Link
            href="/terms"
            className="hover:text-foreground transition-colors"
          >
            Terms of Service
          </Link>
          <Link
            href="/pricing"
            className="hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
          <Link href="/" className="hover:text-foreground transition-colors">
            Trust Security
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass rounded-xl p-6 border border-white/8">
      <h2 className="text-base font-semibold text-foreground mb-4">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 py-2 border-b border-white/5 last:border-0">
      <span className="text-foreground font-medium w-44 shrink-0">{label}</span>
      <span>{value}</span>
    </div>
  );
}
