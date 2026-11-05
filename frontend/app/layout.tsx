import type { Metadata } from "next";
import "./globals.css";
import "./canva-theme.css";
import "./cinematic-hero.css";
export const metadata: Metadata = {
  title: "Lunar Landing Site Navigator",
  description:
    "Explore lunar south pole Sun and Earth visibility using NASA/JPL ephemerides. Scientific mission planning demonstrator.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
