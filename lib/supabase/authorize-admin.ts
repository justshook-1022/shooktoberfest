import { getAdminClient } from "./admin";

export async function authorizeAdmin(request: Request) {
  const admin = getAdminClient();
  if (!admin) return { admin: null, player: null, configured: false };
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { admin, player: null, configured: true };
  const { data: auth } = await admin.auth.getUser(token);
  if (!auth.user) return { admin, player: null, configured: true };
  const { data: player } = await admin.from("players").select("id,event_id,is_admin").eq("auth_user_id", auth.user.id).eq("is_admin", true).maybeSingle();
  return { admin, player, configured: true };
}
