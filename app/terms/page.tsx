import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FadeIn } from "@/components/ui/fade-in";

export const metadata: Metadata = {
  title: "Terms of Service | Trust Security",
  description: "Trust Security Terms of Service",
};

const LAST_UPDATED = "March 5, 2026";
const CONTACT_EMAIL = "contact@trust-scan.me";

export default function TermsPage() {
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
            <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
            <p className="text-muted-foreground text-sm">
              Last updated: {LAST_UPDATED}
            </p>
          </div>
        </FadeIn>

        <FadeIn delay={0.15} className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <p className="text-foreground">
            Please read these Terms of Service (&quot;Terms&quot;) carefully before
            using Trust Security (&quot;Trust&quot;, &quot;we&quot;, &quot;our&quot;, &quot;the Service&quot;) at{" "}
            <span className="text-neon-cyan">trust-scan.me</span>. By accessing
            or using the Service, you agree to be bound by these Terms.
          </p>

          <Section title="1. Service Description">
            <p>
              Trust provides automated security scanning for websites and GitHub
              repositories, together with AI-powered vulnerability analysis. The
              Service is designed to help developers identify and remediate
              security issues in software they own or are authorized to test.
            </p>
          </Section>

          <Section title="2. Eligibility">
            <p>
              You must be at least 14 years old and capable of forming a binding
              contract to use the Service. By creating an account, you represent
              that all information you provide is accurate and that you meet
              these requirements. We use GitHub OAuth for authentication; you
              must use your own GitHub account.
            </p>
          </Section>

          <Section title="3. Permitted Use and Prohibited Conduct">
            <p>You may only use the Service to:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>
                Scan websites or repositories you own or have explicit written
                permission to test.
              </li>
              <li>
                Identify and fix security vulnerabilities in your own projects.
              </li>
            </ul>
            <p className="mt-3">The following conduct is strictly prohibited:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>Scanning systems you do not own or lack authorization to test.</li>
              <li>
                Using scan results to attack, exploit, or harm any system or
                individual.
              </li>
              <li>
                Automated or bulk scanning of third-party targets without
                consent.
              </li>
              <li>
                Any action that places excessive or unreasonable load on our
                infrastructure.
              </li>
              <li>
                Attempting to reverse-engineer, decompile, or circumvent the
                Service.
              </li>
            </ul>
            <p className="mt-3">
              You are solely responsible for ensuring you have proper
              authorization before initiating any scan. Trust acts only as a
              tool at your direction and assumes no liability for unauthorized
              scans you initiate. Violation of these rules may result in
              immediate account termination and, where applicable, referral to
              law enforcement.
            </p>
          </Section>

          <Section title="4. Accounts and Security">
            <p>
              You are responsible for maintaining the confidentiality of your
              account credentials and for all activity that occurs under your
              account. Notify us immediately at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-neon-cyan hover:underline"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              if you suspect unauthorized access.
            </p>
          </Section>

          <Section title="5. Paid Plans and Billing">
            <p>
              Trust Pro is available on a monthly ($9.9/month during the launch
              offer) or annual ($99/year) subscription basis. All payments are
              processed by{" "}
              <span className="text-foreground">Paddle</span>, our Merchant of
              Record. Paddle&apos;s own terms and privacy policy apply to the
              payment transaction.
            </p>
            <p className="mt-2">
              Subscriptions renew automatically at the end of each billing
              period. You will receive a renewal reminder by email at least 7
              days in advance.
            </p>
          </Section>

          <Section title="6. Refund Policy">
            <p>
              We offer a full refund within 30 days of any payment, no
              questions asked. To request a refund, email{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-neon-cyan hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              . Refunds are processed within 3–5 business days.
            </p>
          </Section>

          <Section title="7. Disclaimer of Warranties">
            <p>
              Scan results are provided for informational purposes only and do
              not constitute a comprehensive security audit, penetration test,
              or professional security consultation. A passing score or high
              grade does not guarantee that your application is free of
              vulnerabilities. We do not warrant that the Service will detect
              all vulnerabilities or that results will be accurate or complete.
              The Service is provided &quot;as is&quot; without warranty of any kind,
              express or implied, to the fullest extent permitted by applicable
              law. You should not rely solely on Trust as your only security
              measure.
            </p>
          </Section>

          <Section title="8. Limitation of Liability">
            <p>
              To the maximum extent permitted by law, Trust and its team shall
              not be liable for any indirect, incidental, special, consequential,
              or punitive damages, including loss of profits or data, arising
              from your use of the Service. Our total liability for any claim
              shall not exceed the amount you paid us in the 12 months preceding
              the claim.
            </p>
          </Section>

          <Section title="9. Intellectual Property">
            <p>
              The Trust platform, logo, and all associated brand assets are the
              intellectual property of the Trust team. Your scan data and reports
              remain yours. You grant us a limited, royalty-free license to
              process your data solely to provide the Service. We may use
              aggregated, anonymized statistics for service improvement.
            </p>
          </Section>

          <Section title="10. Service Changes and Termination">
            <p>
              We may modify or discontinue features with reasonable notice. If
              we discontinue the Service entirely, we will provide at least 30
              days&apos; notice by email and pro-rate refunds for any unused paid
              period.
            </p>
          </Section>

          <Section title="11. Changes to These Terms">
            <p>
              We will notify you of material changes by email or in-app notice
              at least 7 days before they take effect. Continued use of the
              Service after changes take effect constitutes your acceptance of
              the revised Terms.
            </p>
          </Section>

          <Section title="12. Governing Law">
            <p>
              These Terms are governed by the laws of the Republic of Korea,
              without regard to conflict-of-law principles. Any dispute shall
              first be addressed by good-faith negotiation. If unresolved,
              disputes shall be submitted to the exclusive jurisdiction of the
              Seoul Central District Court.
            </p>
          </Section>

          <Section title="13. Contact">
            <p>
              Questions about these Terms? Reach us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-neon-cyan hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </FadeIn>
      </main>

      <footer className="border-t border-white/8 mt-10 py-8 text-center text-xs text-muted-foreground">
        <div className="flex justify-center gap-6">
          <Link
            href="/privacy"
            className="hover:text-foreground transition-colors"
          >
            Privacy Policy
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
      <h2 className="text-base font-semibold text-foreground mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
