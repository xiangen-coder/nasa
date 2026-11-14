import type { Metadata } from "next";
import "./globals.css";
import "./canva.css";
import "./cinematic-hero.css";
import "./integration-latest.css";
import "./canva-reference.css";
import "./preliminary-news.css";
import "./mission-lab.css";
import "./account.css";
import "./classroom-theme.css";
import "./research-workflow.css";
import "./about-lunar.css";
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
