import { NextRequest, NextResponse } from "next/server";
import * as tls from "tls";

const SECURITY_HEADERS = [
  { id: "hsts", header: "strict-transport-security", name: "Strict-Transport-Security", shortName: "HSTS" },
  { id: "csp", header: "content-security-policy", name: "Content-Security-Policy", shortName: "CSP" },
  { id: "x-frame", header: "x-frame-options", name: "X-Frame-Options", shortName: "X-Frame" },
  { id: "x-content-type", header: "x-content-type-options", name: "X-Content-Type-Options", shortName: "X-Content-Type" },
  { id: "permissions", header: "permissions-policy", name: "Permissions-Policy", shortName: "Permissions" },
  { id: "referrer", header: "referrer-policy", name: "Referrer-Policy", shortName: "Referrer" },
  { id: "x-xss", header: "x-xss-protection", name: "X-XSS-Protection", shortName: "XSS Filter" },
] as const;

interface SSLInfo {
  valid: boolean;
  issuer: string | null;
  subject: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  protocol: string | null;
}

function checkSSL(hostname: string, port: number = 443): Promise<SSLInfo | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve(null);
    }, 5000);

    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: false },
      () => {
        clearTimeout(timeout);
        const cert = socket.getPeerCertificate();
        const protocol = socket.getProtocol();

        if (!cert || !cert.valid_from) {
          socket.destroy();
          resolve(null);
          return;
        }

        const validTo = new Date(cert.valid_to);
        const now = new Date();
        const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        resolve({
          valid: socket.authorized,
          issuer: typeof cert.issuer === "object" ? cert.issuer.O || cert.issuer.CN || null : null,
          subject: typeof cert.subject === "object" ? cert.subject.CN || null : null,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysRemaining,
          protocol: protocol || null,
        });

        socket.destroy();
      }
    );

    socket.on("error", () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Basic URL validation
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "Invalid protocol" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Block private IPs / metadata endpoints
  const hostname = parsedUrl.hostname.toLowerCase();
  const blocked = [
    "localhost", "127.0.0.1", "0.0.0.0",
    "169.254.169.254", "metadata.google.internal",
  ];
  if (blocked.includes(hostname) || hostname.startsWith("10.") || hostname.startsWith("192.168.")) {
    return NextResponse.json({ error: "Private addresses not allowed" }, { status: 400 });
  }

  try {
    // Run header check and SSL check in parallel
    const [headerResult, sslInfo] = await Promise.all([
      checkHeaders(parsedUrl),
      parsedUrl.protocol === "https:"
        ? checkSSL(parsedUrl.hostname, parsedUrl.port ? parseInt(parsedUrl.port) : 443)
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      ...headerResult,
      ssl: sslInfo,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to check: ${message}` },
      { status: 502 }
    );
  }
}

async function checkHeaders(parsedUrl: URL) {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(parsedUrl.toString(), {
    method: "GET",
    redirect: "follow",
    signal: controller.signal,
    headers: {
      "User-Agent": "Trust-Security-Scanner/1.0",
      "Range": "bytes=0-0",
    },
  });

  clearTimeout(timeout);
  const responseTime = Date.now() - startTime;

  const headers = Object.fromEntries(
    SECURITY_HEADERS.map(({ id, header, name, shortName }) => {
      const value = response.headers.get(header);
      return [id, {
        name,
        shortName,
        present: value !== null,
        value: value ? (value.length > 200 ? value.slice(0, 200) + "..." : value) : null,
      }];
    })
  );

  const serverHeader = response.headers.get("server");

  return {
    url: parsedUrl.toString(),
    statusCode: response.status,
    responseTime,
    headers,
    server: serverHeader,
  };
}
