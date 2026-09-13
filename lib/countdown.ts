// October 2 is in Central Daylight Time (UTC−05:00).
export const EVENT_START = "2026-10-02T10:00:00-05:00";

export function getCountdown(now: number) {
  const total = Math.max(0, Math.ceil((Date.parse(EVENT_START) - now) / 1000));
  return {
    Days: Math.floor(total / 86400),
    Hours: Math.floor(total / 3600) % 24,
    Minutes: Math.floor(total / 60) % 60,
    Seconds: total % 60,
  };
}
