export const MAX_SCORE_SAVE_ATTEMPTS = 5;

export type ScoreSaveError = {
  message?: string;
  code?: string;
  status?: number;
};

export function scoreRetryDelay(attempt: number) {
  return Math.min(10_000, 1_000 * 2 ** Math.max(0, attempt));
}

export function isRetryableScoreError(error: ScoreSaveError | null | undefined) {
  if (!error) return false;
  if (typeof error.status === "number") {
    if (error.status === 408 || error.status === 429 || error.status >= 500) return true;
    if (error.status >= 400) return false;
  }
  if (error.code && /^(08|53|57P0)/.test(error.code)) return true;
  return /failed to fetch|network|timed? out|timeout|connection|temporarily unavailable/i.test(error.message || "");
}
