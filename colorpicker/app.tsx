import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { StrictMode, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import styles from "./app.module.css";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function ColorPickerApp() {
  const [color, setColor] = useState("#3b82f6");
  const [sent, setSent] = useState(false);

  const { app, error } = useApp({
    appInfo: { name: "Color Picker", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.onteardown = async () => ({});
      app.onerror = console.error;
    },
  });

  const rgb = hexToRgb(color);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  const handleUseColor = useCallback(async () => {
    if (!app) return;
    setSent(true);
    try {
      await app.sendMessage({
        role: "user",
        content: [{
          type: "text",
          text: `Selected color: ${color} (RGB: ${rgb.r}, ${rgb.g}, ${rgb.b} | HSL: ${hsl.h}°, ${hsl.s}%, ${hsl.l}%). Describe the color in detail using prosa and analogies from nature.`,
        }],
      });
    } finally {
      setTimeout(() => setSent(false), 2000);
    }
  }, [app, color, rgb, hsl]);

  if (error) return <div className={styles.error}><strong>Error:</strong> {error.message}</div>;
  if (!app) return <div className={styles.loading}>Connecting...</div>;

  return (
    <main className={styles.main}>
      <h2 className={styles.heading}>Color Picker</h2>

      <div className={styles.pickerSection}>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className={styles.colorInput}
        />
        <div className={styles.preview} style={{ background: color }} />
      </div>

      <div className={styles.values}>
        <div className={styles.valueRow}>
          <span className={styles.label}>HEX</span>
          <code className={styles.value}>{color.toUpperCase()}</code>
        </div>
        <div className={styles.valueRow}>
          <span className={styles.label}>RGB</span>
          <code className={styles.value}>{rgb.r}, {rgb.g}, {rgb.b}</code>
        </div>
        <div className={styles.valueRow}>
          <span className={styles.label}>HSL</span>
          <code className={styles.value}>{hsl.h}°, {hsl.s}%, {hsl.l}%</code>
        </div>
      </div>

      <button
        className={styles.button}
        style={{ background: color }}
        onClick={handleUseColor}
        disabled={sent}
      >
        {sent ? "Sent!" : "Use this color"}
      </button>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ColorPickerApp />
  </StrictMode>,
);
