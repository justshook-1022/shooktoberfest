export const AUTH_NEXT_COOKIE = "shook-auth-next";

export function safeNext(value: string | null | undefined, fallback = "/me") {
  if (!value?.startsWith("/")) return fallback;

  try {
    const base = new URL("https://shooktoberfest.invalid");
    const destination = new URL(value, base);
    if (destination.origin !== base.origin) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}

export function decodeAuthNextCookie(value: string | undefined) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
