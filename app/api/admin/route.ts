import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorizeAdmin } from "../../../lib/supabase/authorize-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHIRT_SIZES = new Set(["S", "M", "L", "XL", "2XL", "3XL"]);
const PAYMENT_STATUSES = new Set(["unpaid", "pending", "paid", "refunded", "comped"]);
const TEAM_STATUSES = new Set(["active", "wd", "dq"]);
const PLAYER_FIELDS = new Set([
  "first_name",
  "last_name",
  "email",
  "phone",
  "handicap_id",
  "handicap_index",
  "course_handicap",
  "shirt_size",
  "wife_attending",
  "wife_name",
  "wife_shirt_size",
  "payment_status",
  "amount_paid_cents",
]);

type AdminClient = SupabaseClient;
type JsonRecord = Record<string, unknown>;

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function hasUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function cleanText(value: unknown, label: string, options: { required?: boolean; max?: number } = {}) {
  if (value === null && !options.required) return null;
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const cleaned = value.trim();
  if (options.required && !cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > (options.max ?? 200)) throw new Error(`${label} is too long.`);
  return cleaned || null;
}

function cleanInteger(value: unknown, label: string, min: number, max: number, nullable = true) {
  if ((value === null || value === "") && nullable) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
  }
  return number;
}

function assertDatabase(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

async function refreshTeamNames(admin: AdminClient, eventId: string) {
  const [{ data: teams, error: teamError }, { data: players, error: playerError }] = await Promise.all([
    admin.from("teams").select("id").eq("event_id", eventId),
    admin.from("players").select("team_id,first_name,last_name").eq("event_id", eventId).not("team_id", "is", null),
  ]);
  assertDatabase(teamError, "Could not read teams.");
  assertDatabase(playerError, "Could not read team members.");

  const members = new Map<string, Array<{ first_name: string; last_name: string }>>();
  for (const member of players ?? []) {
    if (!member.team_id) continue;
    const list = members.get(member.team_id) ?? [];
    list.push(member);
    members.set(member.team_id, list);
  }

  for (const team of teams ?? []) {
    const teamMembers = members.get(team.id) ?? [];
    if (teamMembers.length === 0) {
      const { error } = await admin.from("teams").delete().eq("id", team.id).eq("event_id", eventId);
      assertDatabase(error, "Could not remove an empty team.");
      continue;
    }
    const name = teamMembers
      .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name))
      .map((member) => member.last_name)
      .join(" / ");
    const { error } = await admin.from("teams").update({ name }).eq("id", team.id).eq("event_id", eventId);
    assertDatabase(error, "Could not rename a team.");
  }
}

async function getAdminState(admin: AdminClient, eventId: string, adminPlayerId: string) {
  const { data: eventTeams, error: eventTeamsError } = await admin.from("teams").select("id").eq("event_id", eventId);
  assertDatabase(eventTeamsError, "Could not load event teams.");
  const teamIds = eventTeams?.map((team) => team.id) ?? [];

  const results = await Promise.all([
    admin.from("events").select("*").eq("id", eventId).single(),
    admin
      .from("players")
      .select("id,auth_user_id,first_name,last_name,email,phone,handicap_id,handicap_index,course_handicap,flight,shirt_size,team_id,wife_attending,wife_name,wife_shirt_size,payment_status,amount_paid_cents,profile_photo_path,is_admin,created_at")
      .eq("event_id", eventId)
      .order("last_name")
      .order("first_name"),
    admin.from("teams").select("id,name,status,playoff_rank,tee_group_id,created_at").eq("event_id", eventId).order("created_at"),
    admin.from("tee_groups").select("id,tee_time,starting_hole,sort_order").eq("event_id", eventId).order("sort_order"),
    admin.from("course_holes").select("hole,par,tee_name,yardage,stroke_index").eq("event_id", eventId).order("hole"),
    teamIds.length ? admin.from("scores").select("id,team_id,hole,strokes,entered_by,updated_at").in("team_id", teamIds) : Promise.resolve({ data: [], error: null }),
    admin.from("greenies").select("hole,player_id,updated_at").eq("event_id", eventId).order("hole"),
    admin.from("leaderboard").select("*").eq("event_id", eventId).order("position"),
    teamIds.length ? admin.from("team_rounds").select("team_id,started_at").in("team_id", teamIds) : Promise.resolve({ data: [], error: null }),
    admin.from("payout_summary").select("*").eq("event_id", eventId).maybeSingle(),
  ]);

  for (const result of results) assertDatabase(result.error, "Could not load admin data.");
  const [event, players, teams, teeGroups, courseHoles, scores, greenies, leaderboard, rounds, payouts] = results;

  return {
    adminPlayerId,
    event: event.data,
    players: players.data ?? [],
    teams: teams.data ?? [],
    teeGroups: teeGroups.data ?? [],
    courseHoles: courseHoles.data ?? [],
    scores: scores.data ?? [],
    rounds: rounds.data ?? [],
    greenies: greenies.data ?? [],
    leaderboard: leaderboard.data ?? [],
    payouts: payouts.data,
  };
}

export async function GET(request: Request) {
  const { admin, player, configured } = await authorizeAdmin(request);
  if (!configured) return NextResponse.json({ configured: false });
  if (!admin || !player) return errorResponse("Admin sign-in required.", 401);

  try {
    return NextResponse.json(await getAdminState(admin, player.event_id, player.id));
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Could not load admin data.", 500);
  }
}

export async function POST(request: Request) {
  const { admin, player, configured } = await authorizeAdmin(request);
  if (!configured) return errorResponse("Admin services are not configured.", 503);
  if (!admin || !player) return errorResponse("Admin sign-in required.", 401);

  let body: JsonRecord;
  try {
    body = (await request.json()) as JsonRecord;
  } catch {
    return errorResponse("The request body is invalid.");
  }

  try {
    switch (body.action) {
      case "set-event-state": {
        const field = body.field;
        if (field !== "signups_open" && field !== "scoring_open") throw new Error("Invalid event setting.");
        if (typeof body.open !== "boolean") throw new Error("The event setting must be on or off.");
        const { error } = await admin.from("events").update({ [field]: body.open }).eq("id", player.event_id);
        assertDatabase(error, "Could not update the event.");
        break;
      }

      case "update-player": {
        if (!hasUuid(body.playerId)) throw new Error("Invalid player.");
        if (!body.updates || typeof body.updates !== "object" || Array.isArray(body.updates)) throw new Error("Player updates are invalid.");
        const updates = body.updates as JsonRecord;
        if (Object.keys(updates).some((field) => !PLAYER_FIELDS.has(field))) throw new Error("A player field is not editable.");

        const { data: current, error: currentError } = await admin
          .from("players")
          .select("*")
          .eq("id", body.playerId)
          .eq("event_id", player.event_id)
          .single();
        assertDatabase(currentError, "Player not found.");

        const normalized: JsonRecord = {};
        if ("first_name" in updates) normalized.first_name = cleanText(updates.first_name, "First name", { required: true, max: 80 });
        if ("last_name" in updates) normalized.last_name = cleanText(updates.last_name, "Last name", { required: true, max: 80 });
        if ("email" in updates) {
          const email = cleanText(updates.email, "Email", { required: true, max: 254 });
          if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
          normalized.email = email.toLowerCase();
        }
        if ("phone" in updates) normalized.phone = cleanText(updates.phone, "Phone", { max: 40 });
        if ("handicap_id" in updates) {
          const handicapId = cleanText(updates.handicap_id, "Handicap ID", { max: 32 });
          if (handicapId && !/^[A-Z0-9 -]{3,32}$/.test(handicapId.toUpperCase())) throw new Error("Handicap ID may contain letters, numbers, spaces, and hyphens.");
          normalized.handicap_id = handicapId?.toUpperCase() ?? null;
        }
        if ("handicap_index" in updates) normalized.handicap_index = cleanInteger(updates.handicap_index, "Handicap index", -20, 99);
        if ("course_handicap" in updates) normalized.course_handicap = cleanInteger(updates.course_handicap, "Course handicap", -20, 99);
        if ("shirt_size" in updates) {
          if (!SHIRT_SIZES.has(String(updates.shirt_size))) throw new Error("Invalid shirt size.");
          normalized.shirt_size = updates.shirt_size;
        }
        if ("wife_attending" in updates) normalized.wife_attending = Boolean(updates.wife_attending);
        if ("wife_name" in updates) normalized.wife_name = cleanText(updates.wife_name, "Guest name", { max: 160 });
        if ("wife_shirt_size" in updates) {
          if (updates.wife_shirt_size !== null && updates.wife_shirt_size !== "" && !SHIRT_SIZES.has(String(updates.wife_shirt_size))) throw new Error("Invalid guest shirt size.");
          normalized.wife_shirt_size = updates.wife_shirt_size || null;
        }
        if ("payment_status" in updates) {
          if (!PAYMENT_STATUSES.has(String(updates.payment_status))) throw new Error("Invalid payment status.");
          normalized.payment_status = updates.payment_status;
        }
        if ("amount_paid_cents" in updates) normalized.amount_paid_cents = cleanInteger(updates.amount_paid_cents, "Amount paid", 0, 1_000_000, false);

        const merged = { ...current, ...normalized };
        if (merged.wife_attending && (!merged.wife_name || !merged.wife_shirt_size)) throw new Error("Guest name and shirt size are required when a guest is attending.");
        if (!merged.wife_attending) {
          normalized.wife_name = null;
          normalized.wife_shirt_size = null;
        }

        const { error } = await admin.from("players").update(normalized).eq("id", body.playerId).eq("event_id", player.event_id);
        assertDatabase(error, "Could not save the player.");

        if (normalized.payment_status && !["paid", "comped"].includes(String(normalized.payment_status))) {
          const { error: detachError } = await admin
            .from("players")
            .update({ team_id: null, flight: null })
            .eq("id", body.playerId)
            .eq("event_id", player.event_id);
          assertDatabase(detachError, "Could not remove the player from the draw.");
        }
        await refreshTeamNames(admin, player.event_id);
        break;
      }

      case "remove-player": {
        if (!hasUuid(body.playerId)) throw new Error("Invalid player.");
        if (body.playerId === player.id) throw new Error("You cannot remove the admin account you are currently using.");
        const { data: target, error: targetError } = await admin
          .from("players")
          .select("id,profile_photo_path")
          .eq("id", body.playerId)
          .eq("event_id", player.event_id)
          .single();
        assertDatabase(targetError, "Player not found.");
        if (!target) throw new Error("Player not found.");
        const { error } = await admin.from("players").delete().eq("id", target.id).eq("event_id", player.event_id);
        assertDatabase(error, "Could not remove the player.");
        if (target.profile_photo_path) await admin.storage.from("profile-photos").remove([target.profile_photo_path]);
        await refreshTeamNames(admin, player.event_id);
        break;
      }

      case "apply-pairings": {
        if (!Array.isArray(body.pairings) || body.pairings.some((row) => {
          if (!row || typeof row !== "object" || Array.isArray(row)) return true;
          const team = row as JsonRecord;
          return (team.teamId !== null && !hasUuid(team.teamId))
            || (team.aPlayerId !== null && !hasUuid(team.aPlayerId))
            || (team.bPlayerId !== "" && !hasUuid(team.bPlayerId));
        })) {
          throw new Error("Pairings are invalid.");
        }
        const { error } = await admin.rpc("admin_apply_team_pairings", {
          p_event_id: player.event_id,
          p_pairings: body.pairings,
        });
        assertDatabase(error, "Could not save the draw.");
        break;
      }

      case "assign-tee-groups": {
        const [{ count: teamCount, error: teamError }, { count: groupCount, error: groupError }] = await Promise.all([
          admin.from("teams").select("*", { count: "exact", head: true }).eq("event_id", player.event_id),
          admin.from("tee_groups").select("*", { count: "exact", head: true }).eq("event_id", player.event_id),
        ]);
        assertDatabase(teamError, "Could not count teams.");
        assertDatabase(groupError, "Could not count tee groups.");
        if (!teamCount) throw new Error("Run the team draw first.");
        if (Math.ceil(teamCount / 2) > (groupCount ?? 0)) throw new Error("There are not enough tee groups for every team.");
        const { error } = await admin.rpc("assign_tee_groups", { p_event_id: player.event_id });
        assertDatabase(error, "Could not assign tee groups.");
        break;
      }

      case "save-tee-assignments": {
        if (!Array.isArray(body.assignments) || body.assignments.some((assignment) => {
          if (!assignment || typeof assignment !== "object" || Array.isArray(assignment)) return true;
          const row = assignment as JsonRecord;
          return !hasUuid(row.team_id) || (row.tee_group_id !== null && !hasUuid(row.tee_group_id));
        })) throw new Error("Tee-group assignments are invalid.");
        const { error } = await admin.rpc("admin_set_tee_group_assignments", {
          p_event_id: player.event_id,
          p_assignments: body.assignments,
        });
        assertDatabase(error, "Could not save tee-group assignments.");
        break;
      }

      case "update-tee-group": {
        if (!hasUuid(body.teeGroupId)) throw new Error("Invalid tee group.");
        const startingHole = cleanInteger(body.startingHole, "Starting hole", 1, 18, false);
        if (typeof body.teeTime !== "string" || !body.teeTime || Number.isNaN(Date.parse(body.teeTime))) throw new Error("Enter a valid tee time.");
        const { error } = await admin
          .from("tee_groups")
          .update({ tee_time: new Date(body.teeTime).toISOString(), starting_hole: startingHole })
          .eq("id", body.teeGroupId)
          .eq("event_id", player.event_id);
        assertDatabase(error, "Could not save the tee time.");
        break;
      }

      case "update-course-hole": {
        const hole = cleanInteger(body.hole, "Hole", 1, 18, false);
        const yardage = cleanInteger(body.yardage, "Yardage", 50, 800, false);
        if (!["Black", "Silver", "Gold"].includes(String(body.teeName))) throw new Error("Invalid tee selection.");
        const { error } = await admin
          .from("course_holes")
          .update({ tee_name: body.teeName, yardage })
          .eq("event_id", player.event_id)
          .eq("hole", hole);
        assertDatabase(error, "Could not update the course.");
        break;
      }

      case "save-scorecard": {
        if (!hasUuid(body.teamId) || !body.scores || typeof body.scores !== "object" || Array.isArray(body.scores)) throw new Error("Scorecard is invalid.");
        for (const [hole, strokes] of Object.entries(body.scores as JsonRecord)) {
          cleanInteger(hole, "Hole", 1, 18, false);
          cleanInteger(strokes, "Strokes", 1, 15, false);
        }
        const { error } = await admin.rpc("admin_save_scorecard", {
          p_event_id: player.event_id,
          p_team_id: body.teamId,
          p_scores: body.scores,
          p_entered_by: player.id,
        });
        assertDatabase(error, "Could not save the scorecard.");
        break;
      }

      case "reset-scoring": {
        if (body.confirmation !== "RESET SCORES") throw new Error("Confirm the score reset before continuing.");
        if (body.teamId !== null && !hasUuid(body.teamId)) throw new Error("Choose a team or the entire event.");
        if (typeof body.clearGreenies !== "boolean") throw new Error("Choose whether to clear closest-to-pin results.");
        const { error } = await admin.rpc("admin_reset_scoring", {
          p_event_id: player.event_id,
          p_team_id: body.teamId,
          p_clear_greenies: body.clearGreenies,
        });
        assertDatabase(error, "Could not reset scores.");
        break;
      }

      case "save-greenie": {
        const hole = cleanInteger(body.hole, "Hole", 1, 18, false);
        if (body.playerId !== null && !hasUuid(body.playerId)) throw new Error("Invalid greenie winner.");
        if (body.playerId === null) {
          const { error } = await admin.from("greenies").delete().eq("event_id", player.event_id).eq("hole", hole);
          assertDatabase(error, "Could not clear the greenie.");
        } else {
          const { data: winner, error: winnerError } = await admin
            .from("players")
            .select("id")
            .eq("id", body.playerId)
            .eq("event_id", player.event_id)
            .in("payment_status", ["paid", "comped"])
            .single();
          assertDatabase(winnerError, "Winner is not in the field.");
          if (!winner) throw new Error("Winner is not in the field.");
          const { error } = await admin.from("greenies").upsert({ event_id: player.event_id, hole, player_id: winner.id });
          assertDatabase(error, "Could not save the greenie.");
        }
        break;
      }

      case "update-team-result": {
        if (!hasUuid(body.teamId) || !TEAM_STATUSES.has(String(body.status))) throw new Error("Invalid team result.");
        const playoffRank = cleanInteger(body.playoffRank, "Playoff rank", 1, 99);
        const { error } = await admin
          .from("teams")
          .update({ status: body.status, playoff_rank: playoffRank })
          .eq("id", body.teamId)
          .eq("event_id", player.event_id);
        assertDatabase(error, "Could not save the team result.");
        break;
      }

      default:
        return errorResponse("Unknown admin action.");
    }

    return NextResponse.json({ ok: true, state: await getAdminState(admin, player.event_id, player.id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The admin change could not be saved.";
    const conflict = /cannot|must|already|not enough|first|started|include|belong/i.test(message);
    return errorResponse(message, conflict ? 409 : 400);
  }
}
