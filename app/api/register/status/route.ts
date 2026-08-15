import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabase/admin";
import { getServerClient } from "../../../../lib/supabase/server";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ paid: false }, { status: 400 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ paid: false });
  const supabase = await getServerClient();
  const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!auth.user) return NextResponse.json({ paid: false }, { status: 401 });
  const { data } = await admin.from("players").select("payment_status").eq("stripe_session_id", sessionId).eq("auth_user_id", auth.user.id).maybeSingle();
  return NextResponse.json({ paid: data?.payment_status === "paid" || data?.payment_status === "comped" });
}
