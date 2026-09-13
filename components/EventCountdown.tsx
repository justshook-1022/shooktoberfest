"use client";

import { useEffect, useState } from "react";
import { getCountdown } from "../lib/countdown";
import styles from "./EventCountdown.module.css";

export default function EventCountdown() {
  const [remaining, setRemaining] = useState<ReturnType<typeof getCountdown> | null>(null);
  useEffect(() => {
    const update = () => setRemaining(getCountdown(Date.now()));
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, []);
  const started = remaining && Object.values(remaining).every(value => value === 0);
  return (
    <div className={styles.countdown} role="timer" aria-live="off" aria-label="Time until Shooktoberfest, October 2, 2026 at 10 a.m. Central">
      <p className={styles.caption}>{started ? "It’s tee time!" : "The countdown to tee time"}</p>
      <div className={styles.units}>
        {(["Days", "Hours", "Minutes", "Seconds"] as const).map(label => (
          <div className={styles.unit} key={label}>
            <span className={styles.value}>{remaining ? String(remaining[label]).padStart(2, "0") : "—"}</span>
            <span className={styles.label}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
