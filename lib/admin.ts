export type AdminEvent = {
  id: string;
  name: string;
  event_date: string;
  course_name: string;
  entry_cents: number;
  pot_cents: number;
  greenie_cents: number;
  field_cap: number;
  signups_open: boolean;
  scoring_open: boolean;
};

export type AdminPlayer = {
  id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  handicap_id: string | null;
  handicap_index: number | null;
  course_handicap: number | null;
  flight: "A" | "B" | null;
  shirt_size: ShirtSize;
  team_id: string | null;
  wife_attending: boolean;
  wife_name: string | null;
  wife_shirt_size: ShirtSize | null;
  payment_status: PaymentStatus;
  amount_paid_cents: number;
  profile_photo_path: string | null;
  is_admin: boolean;
  created_at: string;
};

export type AdminTeam = {
  id: string;
  name: string | null;
  status: "active" | "wd" | "dq";
  playoff_rank: number | null;
  tee_group_id: string | null;
  created_at: string;
};

export type AdminTeeGroup = {
  id: string;
  tee_time: string | null;
  starting_hole: number;
  sort_order: number | null;
};

export type AdminCourseHole = {
  hole: number;
  par: number;
  tee_name: "Black" | "Silver" | "Gold";
  yardage: number;
  stroke_index: number;
};

export type AdminScore = {
  id: string;
  team_id: string;
  hole: number;
  strokes: number;
  entered_by: string | null;
  updated_at: string;
};

export type AdminGreenie = {
  hole: number;
  player_id: string | null;
  updated_at: string;
};

export type AdminLeaderboardRow = {
  team_id: string;
  position: number;
  team_name: string | null;
  status: "active" | "wd" | "dq";
  holes_played: number;
  gross: number;
  net: number | null;
  net_to_par: number | null;
  team_hcp: number;
  playoff_rank: number | null;
};

export type AdminPayouts = {
  paid_players: number;
  pot_cents_total: number;
  par3_count: number;
  greenie_cents: number;
  greenie_pool_cents: number;
  distributable_cents: number;
  first_cents: number;
  second_cents: number;
  third_cents: number;
};

export type AdminState = {
  adminPlayerId: string;
  event: AdminEvent;
  players: AdminPlayer[];
  teams: AdminTeam[];
  teeGroups: AdminTeeGroup[];
  courseHoles: AdminCourseHole[];
  scores: AdminScore[];
  rounds: Array<{ team_id: string; started_at: string }>;
  greenies: AdminGreenie[];
  leaderboard: AdminLeaderboardRow[];
  payouts: AdminPayouts | null;
};

export type ShirtSize = "S" | "M" | "L" | "XL" | "2XL" | "3XL";
export type PaymentStatus = "unpaid" | "pending" | "paid" | "refunded" | "comped";
export type PairingRow = { aPlayerId: string | null; bPlayerId: string };

export const shirtSizes: ShirtSize[] = ["S", "M", "L", "XL", "2XL", "3XL"];
export const paymentStatuses: PaymentStatus[] = ["unpaid", "pending", "paid", "refunded", "comped"];

export function playerName(player: Pick<AdminPlayer, "first_name" | "last_name">) {
  return `${player.first_name} ${player.last_name}`;
}

export function isInDraw(player: AdminPlayer) {
  return player.payment_status === "paid" || player.payment_status === "comped";
}

export function handicapForDraw(player: AdminPlayer) {
  return player.course_handicap ?? player.handicap_index ?? 99;
}

export function splitFlights(players: AdminPlayer[]) {
  const field = players.filter(isInDraw).sort((left, right) => {
    return handicapForDraw(left) - handicapForDraw(right)
      || left.last_name.localeCompare(right.last_name)
      || left.first_name.localeCompare(right.first_name)
      || left.id.localeCompare(right.id);
  });
  const half = Math.floor(field.length / 2);
  return { aPlayers: field.slice(0, half), bPlayers: field.slice(half) };
}

function shuffled<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function randomPairings(players: AdminPlayer[], random = Math.random): PairingRow[] {
  const { aPlayers, bPlayers } = splitFlights(players);
  const aFlight = shuffled(aPlayers, random);
  const bFlight = shuffled(bPlayers, random);
  return bFlight.map((bPlayer, index) => ({
    aPlayerId: aFlight[index]?.id ?? null,
    bPlayerId: bPlayer.id,
  }));
}

export function pairingsFromState(state: AdminState): PairingRow[] {
  if (!state.teams.length) return [];
  const { aPlayers, bPlayers } = splitFlights(state.players);
  const aIds = new Set(aPlayers.map((player) => player.id));
  const bIds = new Set(bPlayers.map((player) => player.id));
  const rows: PairingRow[] = [];
  const used = new Set<string>();

  for (const team of state.teams) {
    const members = state.players.filter((candidate) => candidate.team_id === team.id);
    const aPlayer = members.find((candidate) => aIds.has(candidate.id));
    const bPlayer = members.find((candidate) => bIds.has(candidate.id));
    if (bPlayer) {
      rows.push({ aPlayerId: aPlayer?.id ?? null, bPlayerId: bPlayer.id });
      if (aPlayer) used.add(aPlayer.id);
      used.add(bPlayer.id);
    }
  }

  for (const bPlayer of bPlayers) {
    if (!used.has(bPlayer.id)) rows.push({ aPlayerId: null, bPlayerId: bPlayer.id });
  }
  return rows;
}

export function manualPairingsFromState(state: AdminState): PairingRow[] {
  const { aPlayers, bPlayers } = splitFlights(state.players);
  const saved = pairingsFromState(state);
  const rows = aPlayers.map((player) => ({
    aPlayerId: player.id as string | null,
    bPlayerId: saved.find((row) => row.aPlayerId === player.id)?.bPlayerId ?? "",
  }));
  if (bPlayers.length > aPlayers.length) {
    rows.push({ aPlayerId: null, bPlayerId: saved.find((row) => !row.aPlayerId)?.bPlayerId ?? "" });
  }
  return rows;
}

export function scrambleHandicap(a: number | null, b: number | null) {
  if (a === null || b === null) return null;
  // Integer hundredths avoid floating-point ties; PostgreSQL rounds ties away from zero.
  const weighted = Math.min(a, b) * 35 + Math.max(a, b) * 15;
  return Math.sign(weighted) * Math.round(Math.abs(weighted) / 100);
}

export function validatePairingRows(rows: PairingRow[], players: AdminPlayer[]) {
  const expected = players.filter(isInDraw).map((player) => player.id).sort();
  const submitted = rows.flatMap((row) => row.aPlayerId ? [row.aPlayerId, row.bPlayerId] : [row.bPlayerId]).sort();
  if (submitted.length !== expected.length || submitted.some((id, index) => id !== expected[index])) {
    return "Every paid or comped player must appear exactly once.";
  }
  return null;
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function formatTeeTime(iso: string | null) {
  if (!iso) return "Time not set";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function teeTimeInputValue(iso: string | null) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function centralTimeInputToIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Enter a valid Central tee time.");
  const [, year, month, day, hour, minute] = match;
  const desired = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let instant = desired;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  // Converge from a UTC wall-clock guess to the instant whose Chicago wall
  // time matches the admin input. This remains correct when the browser is in
  // another timezone and across Central daylight-saving changes.
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
    const rendered = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
    instant += desired - rendered;
  }
  return new Date(instant).toISOString();
}
