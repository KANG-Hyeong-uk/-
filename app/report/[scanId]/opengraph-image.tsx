import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Gwangju Security Report";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

function getGradeColor(grade: string): string {
  switch (grade) {
    case "A":
      return "#4ade80";
    case "B+":
      return "#86efac";
    case "B":
      return "#facc15";
    case "B-":
      return "#eab308";
    case "C":
      return "#fb923c";
    case "D":
      return "#f87171";
    case "F":
      return "#ef4444";
    default:
      return "#9ca3af";
  }
}

export default async function OGImage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await params;

  let score = 0;
  let grade = "?";
  let target = "Unknown";
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;

  try {
    const res = await fetch(`${API_URL}/api/scan/${scanId}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      score = data.score ?? 0;
      grade = data.grade || "?";
      target = data.target_url || "Unknown";
      critical = data.summary?.critical ?? 0;
      high = data.summary?.high ?? 0;
      medium = data.summary?.medium ?? 0;
      low = data.summary?.low ?? 0;
    }
  } catch {
    // Use defaults
  }

  const gradeColor = getGradeColor(grade);
  const displayTarget =
    target.length > 40 ? target.substring(0, 37) + "..." : target;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px",
          background: "linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0a0a0f 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top - Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: "rgba(0, 243, 255, 0.2)",
              border: "1px solid rgba(0, 243, 255, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "18px",
              color: "#00f3ff",
            }}
          >
            T
          </div>
          <span style={{ fontSize: "24px", color: "#e0e0e0", fontWeight: 600 }}>
            Gwangju Security
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: "16px",
              color: "rgba(255,255,255,0.4)",
            }}
          >
            {displayTarget}
          </span>
        </div>

        {/* Center - Score + Grade */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "48px",
            flex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "120px",
                fontWeight: 800,
                color: gradeColor,
                lineHeight: 1,
                letterSpacing: "-4px",
              }}
            >
              {grade}
            </span>
            <span
              style={{
                fontSize: "18px",
                color: "rgba(255,255,255,0.5)",
                marginTop: "8px",
              }}
            >
              Security Grade
            </span>
          </div>

          <div
            style={{
              width: "1px",
              height: "120px",
              background: "rgba(255,255,255,0.1)",
            }}
          />

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "100px",
                fontWeight: 700,
                color: "#ffffff",
                lineHeight: 1,
              }}
            >
              {score}
            </span>
            <span
              style={{
                fontSize: "18px",
                color: "rgba(255,255,255,0.5)",
                marginTop: "8px",
              }}
            >
              / 100 Score
            </span>
          </div>
        </div>

        {/* Bottom - Vulnerability Summary */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "24px",
          }}
        >
          {[
            { label: "Critical", count: critical, color: "#ef4444" },
            { label: "High", count: high, color: "#f87171" },
            { label: "Medium", count: medium, color: "#facc15" },
            { label: "Low", count: low, color: "#60a5fa" },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 16px",
                borderRadius: "8px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: item.color,
                }}
              />
              <span style={{ fontSize: "16px", color: "rgba(255,255,255,0.7)" }}>
                {item.label}:
              </span>
              <span style={{ fontSize: "18px", color: "#ffffff", fontWeight: 600 }}>
                {item.count}
              </span>
            </div>
          ))}

          <span
            style={{
              marginLeft: "auto",
              fontSize: "14px",
              color: "rgba(0, 243, 255, 0.6)",
            }}
          >
            trust-scan.me
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
