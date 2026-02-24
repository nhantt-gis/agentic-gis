/**
 * Mutable map state: marker references and nearby search context.
 *
 * Centralized so that tools, visuals, and cleanup functions
 * all operate on the same shared references.
 */

import type { Marker } from 'maplibre-gl';
import type { NearbyPlaceType } from '@/types';
import type { Province } from './gtel-api';

export interface NearbySearchContext {
  keyword: string | null;
  type: NearbyPlaceType | null;
  radius: number;
  minRating: number | null;
  center: { lat: number; lng: number };
  label: string;
}

/**
 * Shared mutable state for map markers and search context.
 * Consumed by tool implementations and visual cleanup functions.
 */
export const mapState = {
  directionsStartMarker: null as Marker | null,
  directionsEndMarker: null as Marker | null,
  nearbyPlaceMarkers: [] as Marker[],
  searchPlaceMarker: null as Marker | null,
  userLocationMarker: null as Marker | null,
  lastNearbySearchContext: null as NearbySearchContext | null,
  provinces: [] as Province[],
};
