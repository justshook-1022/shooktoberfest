export type HistoryPhoto = {
  src: string;
  alt: string;
  caption: string;
  position?: string;
  aspectRatio?: string;
};

export type Champion = {
  year: "2026" | "2025" | "2024" | "2023" | "2022" | "2021";
  winners: readonly [string, string];
  titles: string;
  note: string;
  image?: string;
  imagePosition?: string;
  imageAspectRatio?: string;
};

export const champions: readonly Champion[] = [
  {
    year: "2026",
    winners: ["Dan Coldegeli", "Jim Blisk"],
    titles: "1",
    note: "2026 champions",
    image: "/hall-of-fame/2026-champions.jpg",
    imagePosition: "center 40%",
    imageAspectRatio: "1 / 1",
  },
  {
    year: "2025",
    winners: ["Dan Coldagelli", "Jason Grueter"],
    titles: "2",
    note: "Two-time champions",
    image: "/hall-of-fame/2025-champions.jpg",
    imagePosition: "center 42%",
  },
  {
    year: "2024",
    winners: ["Chris Granow", "Arvin Joshi"],
    titles: "1",
    note: "Defending the tradition",
    image: "/hall-of-fame/2024-champions.jpg",
    imagePosition: "center 38%",
  },
  {
    year: "2023",
    winners: ["Rob Conley", "Peter Bychowski"],
    titles: "1",
    note: "Tournament champions",
    image: "/hall-of-fame/2023-champions.jpg",
    imagePosition: "center 43%",
  },
  {
    year: "2022",
    winners: ["Bill Shanahan", "Ryan Lannon"],
    titles: "1",
    note: "Tournament champions",
  },
  {
    year: "2021",
    winners: ["Dan Coldagelli", "Jason Grueter"],
    titles: "2",
    note: "The first champions",
    image: "/hall-of-fame/2021-champions.jpg",
    imagePosition: "center 40%",
  },
];

const playerCounts: Record<Champion["year"], number | null> = {
  "2026": null,
  "2025": 26,
  "2024": 16,
  "2023": null,
  "2022": null,
  "2021": null,
};

const eventPhotos: Record<Champion["year"], readonly HistoryPhoto[]> = {
  "2026": [
    {
      src: "/past-events/2026-everyone.jpg",
      alt: "Players, families, and friends together at Shooktoberfest 2026",
      caption: "The 2026 Shooktoberfest crew",
      position: "center",
    },
    {
      src: "/hall-of-fame/2026-champions.jpg",
      alt: "2026 Shooktoberfest champions Dan Coldegeli and Jim Blisk wearing their champion hats",
      caption: "Dan Coldegeli & Jim Blisk · 2026 champions",
      position: "center 40%",
      aspectRatio: "1 / 1",
    },
  ],
  "2025": [
    {
      src: "/shooktoberfest-past-event.jpg",
      alt: "Shooktoberfest players, families, and friends gathered after the 2025 event",
      caption: "The full Shooktoberfest crew",
      position: "center 48%",
    },
    {
      src: "/past-events/2025-players.jpg",
      alt: "The 2025 Shooktoberfest field gathered at Mt Prospect Golf Club",
      caption: "The 2025 field",
      position: "center 48%",
    },
  ],
  "2024": [
    {
      src: "/past-events/2024-players.jpg",
      alt: "The 2024 Shooktoberfest field gathered at Mt Prospect Golf Club",
      caption: "The 2024 field",
      position: "center 50%",
    },
    {
      src: "/past-events/2024-everyone.jpg",
      alt: "Shooktoberfest players, families, and friends gathered after the 2024 event",
      caption: "The full Shooktoberfest crew",
      position: "center 48%",
    },
  ],
  "2023": [
    {
      src: "/hall-of-fame/2023-champions.jpg",
      alt: "2023 champions Rob Conley and Peter Bychowski with their trophies",
      caption: "Rob Conley & Peter Bychowski celebrate",
      position: "center 43%",
    },
    {
      src: "/past-events/2023-field.jpg",
      alt: "The 2023 Shooktoberfest field gathered on the golf course",
      caption: "The 2023 field",
      position: "center 50%",
    },
  ],
  "2022": [],
  "2021": [
    {
      src: "/hall-of-fame/2021-champions.jpg",
      alt: "2021 champions Dan Coldagelli and Jason Grueter with their trophies",
      caption: "The first champions",
      position: "center 40%",
    },
    {
      src: "/past-events/2021-field.jpg",
      alt: "The 2021 Shooktoberfest field gathered on the golf course",
      caption: "The 2021 field",
      position: "center 48%",
    },
  ],
};

export const pastEvents = champions.map((champion) => ({
  ...champion,
  playerCount: playerCounts[champion.year],
  photos: eventPhotos[champion.year],
}));
