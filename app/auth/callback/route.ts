import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_NEXT_COOKIE, decodeAuthNextCookie, safeNext } from "../../../lib/auth-redirect";

export async function GET(request: NextRequest) {
  const requestUrl = request.nextUrl;
  const code = requestUrl.searchParams.get("code");
  const cookieNext = decodeAuthNextCookie(request.cookies.get(AUTH_NEXT_COOKIE)?.value);
  const next = safeNext(cookieNext ?? requestUrl.searchParams.get("next"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (code && url && key) {
    const response = NextResponse.redirect(new URL(next, requestUrl.origin));
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    const flowId = requestUrl.searchParams.get("sb_flow_id");
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (!error) {
      response.cookies.set(AUTH_NEXT_COOKIE, "", { path: "/", maxAge: 0 });
      return response;
    }
  }

  const errorResponse = NextResponse.redirect(new URL(`/login?error=auth&next=${encodeURIComponent(next)}`, requestUrl.origin));
  errorResponse.cookies.set(AUTH_NEXT_COOKIE, "", { path: "/", maxAge: 0 });
  return errorResponse;
}
