import { NextResponse } from "next/server";
import { getAdminClient } from "../../../../lib/supabase/admin";
import { getServerClient } from "../../../../lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await getServerClient();
  const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!auth.user) return NextResponse.json({ error: "Sign in again before saving your photo." }, { status: 401 });

  const body = await request.json() as { path?: unknown };
  const expectedPath = `${auth.user.id}/avatar.jpg`;
  if (body.path !== expectedPath) return NextResponse.json({ error: "Invalid profile photo path." }, { status: 400 });

  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "Account setup is temporarily unavailable." }, { status: 503 });

  const { data: object, error: objectError } = await admin.storage
    .from("profile-photos")
    .list(auth.user.id, { search: "avatar.jpg", limit: 1 });
  if (objectError || !object?.some(item => item.name === "avatar.jpg")) {
    return NextResponse.json({ error: "Upload the profile photo before continuing." }, { status: 409 });
  }

  const { data: player, error } = await admin
    .from("players")
    .update({ profile_photo_path: expectedPath })
    .eq("auth_user_id", auth.user.id)
    .in("payment_status", ["unpaid", "pending"])
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Your photo could not be attached to your profile." }, { status: 500 });
  if (!player) return NextResponse.json({ error: "Save your golfer details before adding a photo." }, { status: 409 });

  return NextResponse.json({ profilePhotoPath: expectedPath, nextStep: 3 });
}
