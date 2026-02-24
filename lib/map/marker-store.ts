/**
 * External store for map marker & popup data — powered by Zustand.
 *
 * Bridges imperative tool calls (tools.ts) with declarative React rendering
 * (MapMarkers component). Tools write data via `markerActions`;
 * React reads via the `useMapMarkers` hook.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';

// ── Popup Data Interfaces ────────────────────────────────────────────

export interface PopupPlaceData {
  name: string;
  address: string;
  rating: number | null;
  userRatingsTotal: number | null;
  distanceMeters: number | null;
  types: string[];
  openNow: boolean | null;
  photoUrl: string | null;
}

export interface BoundaryPlaceData {
  name: string;
  nameEn: string;
  level: string;
  center: { lat: number; lng: number };
}

// ── Marker Data Types ────────────────────────────────────────────────

export interface SearchPlaceMarker {
  lngLat: [number, number];
  color: string;
  popupData: PopupPlaceData;
}

export interface BoundaryMarker {
  lngLat: [number, number];
  color: string;
  popupData: BoundaryPlaceData;
}

export interface DirectionMarker {
  lngLat: [number, number];
  color: string;
  label: string;
  address: string;
}

export interface NearbyPlaceMarker {
  lngLat: [number, number];
  popupData: PopupPlaceData;
  photoUrl: string | null;
  name: string;
}

export interface UserLocationMarker {
  lngLat: [number, number];
}

// ── Store State & Actions ────────────────────────────────────────────

export interface MapMarkerState {
  searchPlace: SearchPlaceMarker | null;
  boundary: BoundaryMarker | null;
  directionsStart: DirectionMarker | null;
  directionsEnd: DirectionMarker | null;
  nearbyPlaces: NearbyPlaceMarker[];
  userLocation: UserLocationMarker | null;
  /**
   * ID of the popup currently open.
   * Values: 'search' | 'boundary' | 'dir-start' | 'dir-end' | 'nearby-{index}' | 'user' | null
   */
  openPopupId: string | null;
}

interface MapMarkerActions {
  setSearchPlace: (marker: SearchPlaceMarker) => void;
  setBoundary: (marker: BoundaryMarker) => void;
  setDirections: (start: DirectionMarker, end: DirectionMarker) => void;
  setNearbyPlaces: (places: NearbyPlaceMarker[]) => void;
  setUserLocation: (marker: UserLocationMarker) => void;
  openPopup: (id: string) => void;
  closePopup: () => void;
  clearSearchPlace: () => void;
  clearBoundary: () => void;
  clearDirections: () => void;
  clearNearbyPlaces: () => void;
  clearUserLocation: () => void;
  clearAll: () => void;
}

const INITIAL_STATE: MapMarkerState = {
  searchPlace: null,
  boundary: null,
  directionsStart: null,
  directionsEnd: null,
  nearbyPlaces: [],
  userLocation: null,
  openPopupId: null,
};

// ── Zustand Store ────────────────────────────────────────────────────

const useMarkerStore = create<MapMarkerState & MapMarkerActions>((set, get) => ({
  ...INITIAL_STATE,

  setSearchPlace: (marker) =>
    set({ searchPlace: marker, boundary: null, openPopupId: 'search' }),

  setBoundary: (marker) =>
    set({ boundary: marker, searchPlace: null, openPopupId: 'boundary' }),

  setDirections: (start, end) =>
    set({ directionsStart: start, directionsEnd: end }),

  setNearbyPlaces: (places) =>
    set({ nearbyPlaces: places, openPopupId: null }),

  setUserLocation: (marker) =>
    set({ userLocation: marker }),

  openPopup: (id) =>
    set({ openPopupId: id }),

  closePopup: () =>
    set({ openPopupId: null }),

  clearSearchPlace: () =>
    set((s) => ({
      searchPlace: null,
      openPopupId: s.openPopupId === 'search' ? null : s.openPopupId,
    })),

  clearBoundary: () =>
    set((s) => ({
      boundary: null,
      openPopupId: s.openPopupId === 'boundary' ? null : s.openPopupId,
    })),

  clearDirections: () =>
    set((s) => ({
      directionsStart: null,
      directionsEnd: null,
      openPopupId:
        s.openPopupId === 'dir-start' || s.openPopupId === 'dir-end'
          ? null
          : s.openPopupId,
    })),

  clearNearbyPlaces: () =>
    set((s) => ({
      nearbyPlaces: [],
      openPopupId: s.openPopupId?.startsWith('nearby-') ? null : s.openPopupId,
    })),

  clearUserLocation: () =>
    set((s) => ({
      userLocation: null,
      openPopupId: s.openPopupId === 'user' ? null : s.openPopupId,
    })),

  clearAll: () =>
    set({ ...INITIAL_STATE }),
}));

// ── Public API (backwards-compatible) ────────────────────────────────

/**
 * Imperative actions — callable from non-React code (tools.ts, visuals.ts).
 * Delegates directly to zustand's `getState()`.
 */
export const markerActions = {
  setSearchPlace: (marker: SearchPlaceMarker) => useMarkerStore.getState().setSearchPlace(marker),
  setBoundary: (marker: BoundaryMarker) => useMarkerStore.getState().setBoundary(marker),
  setDirections: (start: DirectionMarker, end: DirectionMarker) =>
    useMarkerStore.getState().setDirections(start, end),
  setNearbyPlaces: (places: NearbyPlaceMarker[]) =>
    useMarkerStore.getState().setNearbyPlaces(places),
  setUserLocation: (marker: UserLocationMarker) =>
    useMarkerStore.getState().setUserLocation(marker),
  openPopup: (id: string) => useMarkerStore.getState().openPopup(id),
  closePopup: () => useMarkerStore.getState().closePopup(),
  clearSearchPlace: () => useMarkerStore.getState().clearSearchPlace(),
  clearBoundary: () => useMarkerStore.getState().clearBoundary(),
  clearDirections: () => useMarkerStore.getState().clearDirections(),
  clearNearbyPlaces: () => useMarkerStore.getState().clearNearbyPlaces(),
  clearUserLocation: () => useMarkerStore.getState().clearUserLocation(),
  clearAll: () => useMarkerStore.getState().clearAll(),
};

/**
 * React hook — subscribe to marker state inside components.
 * Returns the data slice only (without action methods).
 * Uses shallow comparison to prevent infinite re-renders.
 */
export function useMapMarkers(): MapMarkerState {
  return useMarkerStore(
    useShallow((s) => ({
      searchPlace: s.searchPlace,
      boundary: s.boundary,
      directionsStart: s.directionsStart,
      directionsEnd: s.directionsEnd,
      nearbyPlaces: s.nearbyPlaces,
      userLocation: s.userLocation,
      openPopupId: s.openPopupId,
    })),
  );
}
