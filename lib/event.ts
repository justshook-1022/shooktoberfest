export type TeeName = "Black" | "Silver" | "Gold";

export type Hole = {
  hole: number;
  par: number;
  tee: TeeName;
  yards: number;
  strokeIndex: number;
  name?: string;
};

export const event = {
  name: "Shooktoberfest",
  date: "Friday, October 2, 2026",
  course: "Mt Prospect Golf Club",
  address: "600 S See-Gwun Ave, Mount Prospect, IL",
  entry: 200,
  fieldCap: 32,
  firstTee: "10:00 AM CT",
};

export const holes: Hole[] = [
  { hole: 1, par: 5, tee: "Black", yards: 575, strokeIndex: 3 },
  { hole: 2, par: 4, tee: "Gold", yards: 380, strokeIndex: 1, name: "Principal's Nose" },
  { hole: 3, par: 4, tee: "Silver", yards: 320, strokeIndex: 11 },
  { hole: 4, par: 3, tee: "Silver", yards: 195, strokeIndex: 15, name: "Redan" },
  { hole: 5, par: 4, tee: "Black", yards: 355, strokeIndex: 7 },
  { hole: 6, par: 4, tee: "Silver", yards: 430, strokeIndex: 5 },
  { hole: 7, par: 3, tee: "Gold", yards: 120, strokeIndex: 17, name: "Biarritz" },
  { hole: 8, par: 4, tee: "Silver", yards: 370, strokeIndex: 9 },
  { hole: 9, par: 4, tee: "Gold", yards: 275, strokeIndex: 13 },
  { hole: 10, par: 3, tee: "Black", yards: 135, strokeIndex: 18 },
  { hole: 11, par: 4, tee: "Black", yards: 435, strokeIndex: 6 },
  { hole: 12, par: 3, tee: "Black", yards: 180, strokeIndex: 16 },
  { hole: 13, par: 4, tee: "Black", yards: 365, strokeIndex: 12, name: "Punchbowl" },
  { hole: 14, par: 4, tee: "Black", yards: 385, strokeIndex: 10 },
  { hole: 15, par: 5, tee: "Silver", yards: 480, strokeIndex: 2 },
  { hole: 16, par: 3, tee: "Gold", yards: 155, strokeIndex: 14 },
  { hole: 17, par: 5, tee: "Black", yards: 480, strokeIndex: 4, name: "Alps" },
  { hole: 18, par: 4, tee: "Gold", yards: 290, strokeIndex: 8 },
];

export const demoLeaderboard = [
  { position: 1, team_name: "Shook / Wood", holes_played: 12, net_to_par: -6, net: 41 },
  { position: 2, team_name: "Burns / Keller", holes_played: 18, net_to_par: -5, net: 65 },
  { position: 3, team_name: "Doyle / Kane", holes_played: 9, net_to_par: -3, net: 32 },
  { position: 4, team_name: "Miller / Walsh", holes_played: 15, net_to_par: -2, net: 55 },
  { position: 5, team_name: "Farrell / Quinn", holes_played: 18, net_to_par: 0, net: 70 },
  { position: 6, team_name: "Ryan / Novak", holes_played: 6, net_to_par: 1, net: 25 },
  { position: 7, team_name: "Hayes / Burke", holes_played: 0, net_to_par: null, net: null },
  { position: 7, team_name: "Sullivan / Reed", holes_played: 0, net_to_par: null, net: null },
];

export const demoTeeTimes = [
  { time: "10:00 AM", teams: ["Shook / Wood", "Burns / Keller"], players: ["Justin Shook", "Nate Wood", "Mike Burns", "Tom Keller"] },
  { time: "10:10 AM", teams: ["Doyle / Kane", "Miller / Walsh"], players: ["Sean Doyle", "Chris Kane", "Adam Miller", "Patrick Walsh"] },
  { time: "10:20 AM", teams: ["Farrell / Quinn", "Ryan / Novak"], players: ["Brian Farrell", "Kevin Quinn", "Matt Ryan", "Paul Novak"] },
  { time: "10:30 AM", teams: ["Hayes / Burke", "Sullivan / Reed"], players: ["Dan Hayes", "Jack Burke", "Tim Sullivan", "Ben Reed"] },
  { time: "10:40 AM", teams: ["Group 5", "Group 5"], players: ["Draw pending", "Draw pending", "Draw pending", "Draw pending"] },
  { time: "10:50 AM", teams: ["Group 6", "Group 6"], players: ["Draw pending", "Draw pending", "Draw pending", "Draw pending"] },
  { time: "11:00 AM", teams: ["Group 7", "Group 7"], players: ["Draw pending", "Draw pending", "Draw pending", "Draw pending"] },
  { time: "11:10 AM", teams: ["Group 8", "Group 8"], players: ["Draw pending", "Draw pending", "Draw pending", "Draw pending"] },
];

export const formatToPar = (value: number | null) => {
  if (value === null) return "—";
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
};

export const strokesReceived = (handicap: number, strokeIndex: number) => {
  if (handicap >= 0) return Math.floor(handicap / 18) + (strokeIndex <= handicap % 18 ? 1 : 0);
  const abs = Math.abs(handicap);
  return -(Math.floor(abs / 18) + (strokeIndex > 18 - (abs % 18) ? 1 : 0));
};
