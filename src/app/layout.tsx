import type { Metadata, Viewport } from "next";
import { Nunito, Tiny5 } from "next/font/google";
import "./globals.css";

const pixel = Tiny5({ variable: "--font-pixel-face", subsets: ["latin"], weight: "400" });
const body = Nunito({ variable: "--font-nunito", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Four Wins: The Life RPG",
  description: "Level up in real life.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b1030",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-AU" className={`${pixel.variable} ${body.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
