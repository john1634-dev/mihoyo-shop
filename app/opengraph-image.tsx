import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/config";

export const runtime = "edge";
export const alt = `${SITE_NAME} — Premium Game Accounts`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(145deg, #020617 0%, #0f172a 55%, #1e293b 100%)",
          color: "#f8fafc",
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#60a5fa",
            marginBottom: 24,
          }}
        >
          {SITE_NAME}
        </div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            maxWidth: 900,
          }}
        >
          Premium Game Accounts
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            lineHeight: 1.4,
            color: "#94a3b8",
            maxWidth: 820,
          }}
        >
          Genshin Impact · Honkai: Star Rail · Zenless Zone Zero · Wuthering Waves
        </div>
      </div>
    ),
    { ...size }
  );
}
