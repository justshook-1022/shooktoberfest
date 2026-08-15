import type { Metadata } from "next";
import "./globals.css";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "Shooktoberfest 2026 | Mt Prospect Golf Club",
  description: "A 32-player, two-person golf scramble at Mt Prospect Golf Club on October 2, 2026.",
  openGraph: {
    title: "Shooktoberfest 2026",
    description: "32 golfers. 16 teams. One bad idea. October 2 at Mt Prospect Golf Club.",
    type: "website",
    images: [{ url: new URL("/og.png", siteUrl).toString(), width: 1733, height: 909, alt: "Shooktoberfest event scorecard" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Shooktoberfest 2026",
    description: "32 golfers. 16 teams. One bad idea.",
    images: [new URL("/og.png", siteUrl).toString()],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
