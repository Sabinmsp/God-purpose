import type { MetadataRoute } from "next";

/** Lets the game be added to a phone's home screen and run like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Four Wins: The Life RPG",
    short_name: "Four Wins",
    description: "Level up in real life.",
    start_url: "/?view=today",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070a1f",
    theme_color: "#0b1030",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
