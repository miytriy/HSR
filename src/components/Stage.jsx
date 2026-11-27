import { useEffect, useState } from "react";

// UI は 390x844（スマホ縦画面）基準で作られているため、
// 広い画面(幅700px以上)では画面の高さに合わせて拡大し、中央に表示する。
// スマホなど狭い画面では拡大せず、そのまま全画面で表示する。
const W = 390;
const H = 844;
const DESKTOP_MIN = 700;

const calcScale = () =>
  window.innerWidth >= DESKTOP_MIN
    ? Math.min(window.innerWidth / W, window.innerHeight / H)
    : 0;

export default function Stage({ children }) {
  const [scale, setScale] = useState(calcScale);

  useEffect(() => {
    const onResize = () => setScale(calcScale());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!scale) {
    return <div style={{ position: "fixed", inset: 0 }}>{children}</div>;
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#05070d", overflow: "hidden",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        style={{
          width: W, height: H, flexShrink: 0, position: "relative", overflow: "hidden",
          transform: `scale(${scale})`, transformOrigin: "center center",
          boxShadow: "0 0 60px rgba(0,0,0,0.6)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
