import type { Metadata } from "next";
import "./globals.css";
import { connection } from "next/server";
import { getRegistrationOpen } from "../lib/registration-status";
import { RegistrationStatusProvider } from "../components/RegistrationStatus";

const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "Shooktoberfest 2026 | Mt Prospect Golf Club",
  description: "Northwest Chicago suburbs’ best Oktoberfest-themed scramble. October 2, 2026 at 10:00 a.m.",
  openGraph: {
    title: "Shooktoberfest 2026",
    description: "October 2 at 10:00 a.m. Two-man scramble, dinner, drinks, prizes, and live music.",
    type: "website",
    images: [{ url: new URL("/og-simple.jpg", siteUrl).toString(), width: 1733, height: 908, alt: "Shooktoberfest 2026 · October 2 at 10:00 a.m." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Shooktoberfest 2026",
    description: "October 2 at 10:00 a.m. Two-man scramble, dinner, drinks, prizes, and live music.",
    images: [new URL("/og-simple.jpg", siteUrl).toString()],
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await connection();
  const registrationOpen = await getRegistrationOpen();
  return (
    <html lang="en">
      <body><RegistrationStatusProvider initialOpen={registrationOpen}>{children}</RegistrationStatusProvider></body>
    </html>
  );
}
