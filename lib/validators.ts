/**
 * Validation utilities for scan targets
 */

export function validateUrl(url: string): { valid: boolean; error?: string } {
  const trimmed = url.trim();
  if (!trimmed) return { valid: false };

  // Extract hostname from URL or raw domain
  let hostname = trimmed;
  try {
    // If it looks like a URL with protocol, parse it
    if (/^https?:\/\//i.test(trimmed)) {
      hostname = new URL(trimmed).hostname;
    } else if (trimmed.includes("/")) {
      // Has a path but no protocol - try adding one for parsing
      hostname = new URL("https://" + trimmed).hostname;
    }
  } catch {
    // Not a valid URL format, treat the whole string as hostname
  }

  // Must contain a dot (domain-like)
  if (!hostname.includes(".")) {
    return { valid: false, error: "Please enter a valid domain or URL (e.g., example.com)" };
  }

  // Block localhost and loopback variants
  const lower = hostname.toLowerCase();
  if (
    lower === "localhost" ||
    lower === "0.0.0.0" ||
    lower.startsWith("[") ||           // IPv6 brackets: [::1], [::ffff:127.0.0.1]
    lower.includes(":")                // raw IPv6
  ) {
    return { valid: false, error: "Internal addresses are not allowed" };
  }

  // Block decimal IP (e.g., 2130706433 = 127.0.0.1)
  if (/^\d+$/.test(hostname)) {
    return { valid: false, error: "Numeric IP addresses are not allowed" };
  }

  // Block octal/hex IP (e.g., 0177.0.0.1, 0x7f.0.0.1)
  if (/^[0-9a-fA-Fx.]+$/.test(hostname) && /0[xX0-7]/.test(hostname)) {
    return { valid: false, error: "Encoded IP addresses are not allowed" };
  }

  // Block internal/private IPs (standard dotted decimal)
  const ipMatch = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipMatch) {
    const [, a, b] = ipMatch.map(Number);
    if (
      a === 0 ||                                 // 0.*
      a === 127 ||                               // 127.*
      a === 10 ||                                // 10.*
      (a === 172 && b >= 16 && b <= 31) ||       // 172.16-31.*
      (a === 192 && b === 168) ||                // 192.168.*
      (a === 169 && b === 254)                   // 169.254.*
    ) {
      return { valid: false, error: "Internal/private IP addresses are not allowed" };
    }
  }

  return { valid: true };
}

export function validateGitHubUrl(input: string): { valid: boolean; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) return { valid: false };
  // Accept owner/repo format
  if (/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(trimmed)) return { valid: true };
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (url.hostname === "github.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) return { valid: true };
    }
  } catch {}
  return { valid: false, error: "Enter a valid GitHub repo (e.g., owner/repo)" };
}
