/**
 * Map / nearby-places architecture (not active yet).
 *
 * Future providers implement `PlacesProvider` behind a server route
 * (e.g. POST /api/places) so map and places API keys stay on the server:
 *   - MapLibre GL + an open tile source for the map view (no client key needed),
 *     or Google Maps with a key restricted by HTTP referrer and API.
 *   - A places search (Google Places, Foursquare, OpenStreetMap Overpass, …)
 *     queried server-side with rounded coordinates, results cached briefly.
 * The game would then show nearby gyms, libraries, universities and
 * workplaces, and could link them to quests (e.g. "Visit the library").
 * Exact coordinates must never be logged or stored, and must only be sent
 * to a provider after the player opts in.
 */
import type { Coordinates } from "./geolocation";

export type PlaceKind = "gym" | "university" | "library" | "workplace" | "park" | "other";

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  /** Distance from the search point, in metres. */
  distance: number;
  lat: number;
  lon: number;
}

export interface PlacesProvider {
  readonly name: string;
  findNearby(near: Pick<Coordinates, "lat" | "lon">, kinds: PlaceKind[], radiusMetres: number): Promise<Place[]>;
}

/** Default until a real provider is configured: returns nothing. */
export const noPlacesProvider: PlacesProvider = {
  name: "none",
  async findNearby() {
    return [];
  },
};

export const PLACE_LABELS: Record<PlaceKind, string> = {
  gym: "Gyms",
  university: "Universities",
  library: "Libraries",
  workplace: "Workplaces",
  park: "Parks",
  other: "Other places",
};
