import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Trust Strategy",
  description: "Trust Security Scanner의 전략 문서 모음 — 린 캔버스, 포지셔닝, 프라이싱 외.",
};

type Tab = {
  label: string;
  desc: string;
  href: string | null;
  active: boolean;
};

const tabs: Tab[] = [
  { label: "린 캔버스", desc: "9-block 비즈니스 모델", href: "/strategy/lean-canvas.html", active: true },
  { label: "포지셔닝", desc: "경쟁 매트릭스 + 빈 슬롯", href: "/strategy/positioning.html", active: true },
  { label: "프라이싱 전략", desc: "준비 중", href: null, active: false },
  { label: "고객 발견", desc: "60명 설문 + 12명 인터뷰 종합", href: "/strategy/customer-discovery/", active: true },
  { label: "시장 분석", desc: "준비 중", href: null, active: false },
  { label: "로드맵", desc: "준비 중", href: null, active: false },
];

export default function StrategyHub() {
  return (
    <>
      <style>{`
        body { background: #080b0f; }
        .strat-hub {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          background: #080b0f;
          color: #dde4ed;
          font-family: 'Pretendard Variable', 'Pretendard', -apple-system, "SF Pro Display", system-ui, sans-serif;
        }
        .strat-hub-inner {
          width: 100%;
          max-width: 880px;
          text-align: center;
        }
        .strat-hub-eyebrow {
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #00f3ff;
          margin-bottom: 14px;
          font-weight: 600;
        }
        .strat-hub-title {
          font-size: clamp(36px, 6vw, 56px);
          font-weight: 800;
          letter-spacing: -1.5px;
          color: #ffffff;
          margin-bottom: 16px;
          line-height: 1.05;
        }
        .strat-hub-title .ac {
          color: #00f3ff;
        }
        .strat-hub-sub {
          font-size: 15px;
          color: #9aacbe;
          line-height: 1.6;
          margin-bottom: 48px;
          max-width: 560px;
          margin-left: auto;
          margin-right: auto;
        }
        .strat-hub-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 14px;
        }
        .strat-chip {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding: 18px 22px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.08);
          color: #c0c8d4;
          text-decoration: none;
          transition: all 0.18s ease;
          cursor: pointer;
          text-align: left;
          font-family: inherit;
        }
        .strat-chip:hover:not(.disabled) {
          background: rgba(0, 243, 255, 0.08);
          border-color: rgba(0, 243, 255, 0.45);
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 243, 255, 0.12);
        }
        .strat-chip-label {
          font-size: 17px;
          font-weight: 700;
          color: #ffffff;
          margin-bottom: 4px;
          letter-spacing: -0.3px;
        }
        .strat-chip:hover:not(.disabled) .strat-chip-label {
          color: #00f3ff;
        }
        .strat-chip-desc {
          font-size: 12px;
          color: #667788;
          letter-spacing: 0.02em;
        }
        .strat-chip-arrow {
          align-self: flex-end;
          margin-top: 12px;
          font-size: 14px;
          color: #00f3ff;
          opacity: 0;
          transition: opacity 0.18s ease, transform 0.18s ease;
        }
        .strat-chip:hover:not(.disabled) .strat-chip-arrow {
          opacity: 1;
          transform: translateX(4px);
        }
        .strat-chip.disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .strat-chip.disabled .strat-chip-label {
          color: #4a5260;
        }
        .strat-chip.disabled .strat-chip-desc {
          color: #3a424d;
        }
        .strat-hub-foot {
          margin-top: 48px;
          font-size: 12px;
          color: #667788;
        }
        .strat-hub-foot a {
          color: #9aacbe;
          text-decoration: none;
          border-bottom: 1px dotted #44525e;
        }
        .strat-hub-foot a:hover {
          color: #00f3ff;
          border-color: #00f3ff;
        }
        @media (max-width: 540px) {
          .strat-hub-grid { grid-template-columns: 1fr; }
        }
      `}</style>
      <main className="strat-hub">
        <div className="strat-hub-inner">
          <div className="strat-hub-eyebrow">Trust Security · Strategy Hub</div>
          <h1 className="strat-hub-title">
            <span className="ac">Trust</span> 전략 문서
          </h1>
          <p className="strat-hub-sub">
            바이브코더를 위한 보안 스캐너 — 비즈니스 모델, 경쟁 포지셔닝, 시장 분석을 한 자리에서.
          </p>
          <div className="strat-hub-grid">
            {tabs.map((tab) =>
              tab.active && tab.href ? (
                <Link key={tab.label} href={tab.href} className="strat-chip">
                  <span className="strat-chip-label">{tab.label}</span>
                  <span className="strat-chip-desc">{tab.desc}</span>
                  <span className="strat-chip-arrow">→</span>
                </Link>
              ) : (
                <div key={tab.label} className="strat-chip disabled" aria-disabled="true">
                  <span className="strat-chip-label">{tab.label}</span>
                  <span className="strat-chip-desc">{tab.desc}</span>
                  <span className="strat-chip-arrow" aria-hidden="true">→</span>
                </div>
              )
            )}
          </div>
          <div className="strat-hub-foot">
            ← <Link href="/">홈으로 돌아가기</Link>
          </div>
        </div>
      </main>
    </>
  );
}
