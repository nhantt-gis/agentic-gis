/**
 * External store for map GeoJSON layer data — powered by Zustand.
 *
 * Bridges imperative tool calls (tools.ts) with declarative React rendering
 * (MapLayers component). Tools write GeoJSON data here;
 * React renders <Source> + <Layer> components automatically.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/shallow';
import type { Feature, FeatureCollection, Geometry, Polygon } from 'geojson';

// ── Layer Data Types ─────────────────────────────────────────────────

export interface DirectionsLayerData {
  /** GeoJSON LineString coordinates */
  coordinates: number[][];
}

export interface NearbyBufferLayerData {
  /** GeoJSON Polygon ring (closed) */
  ring: Array<[number, number]>;
  radiusMeters: number;
}

export interface BoundaryLayerData {
  /** GeoJSON MultiPolygon or Polygon geometry */
  geom: { type: string; coordinates: number[][][][] };
  viewport?: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  };
}

// ── Store State & Actions ────────────────────────────────────────────

export interface MapLayerState {
  directions: DirectionsLayerData | null;
  nearbyBuffer: NearbyBufferLayerData | null;
  boundary: BoundaryLayerData | null;
}

interface MapLayerActions {
  setDirections: (data: DirectionsLayerData) => void;
  setNearbyBuffer: (data: NearbyBufferLayerData) => void;
  setBoundary: (data: BoundaryLayerData) => void;
  clearDirections: () => void;
  clearNearbyBuffer: () => void;
  clearBoundary: () => void;
  clearAll: () => void;
}

const INITIAL_STATE: MapLayerState = {
  directions: null,
  nearbyBuffer: null,
  boundary: null,
};

// ── Zustand Store ────────────────────────────────────────────────────

const useLayerStore = create<MapLayerState & MapLayerActions>((set) => ({
  ...INITIAL_STATE,

  setDirections: (data) => set({ directions: data }),
  setNearbyBuffer: (data) => set({ nearbyBuffer: data }),
  setBoundary: (data) => set({ boundary: data }),

  clearDirections: () => set({ directions: null }),
  clearNearbyBuffer: () => set({ nearbyBuffer: null }),
  clearBoundary: () => set({ boundary: null }),
  clearAll: () => set({ ...INITIAL_STATE }),
}));

// ── Public API (backwards-compatible) ────────────────────────────────

/**
 * Imperative actions — callable from non-React code (tools.ts, visuals.ts).
 */
export const layerActions = {
  setDirections: (data: DirectionsLayerData) => useLayerStore.getState().setDirections(data),
  setNearbyBuffer: (data: NearbyBufferLayerData) =>
    useLayerStore.getState().setNearbyBuffer(data),
  setBoundary: (data: BoundaryLayerData) => useLayerStore.getState().setBoundary(data),
  clearDirections: () => useLayerStore.getState().clearDirections(),
  clearNearbyBuffer: () => useLayerStore.getState().clearNearbyBuffer(),
  clearBoundary: () => useLayerStore.getState().clearBoundary(),
  clearAll: () => useLayerStore.getState().clearAll(),
};

// ── React Hook ───────────────────────────────────────────────────────

/**
 * Subscribe to the layer store from a React component.
 * Returns the data slice only (without action methods).
 */
export function useMapLayers(): MapLayerState {
  return useLayerStore(
    useShallow((s) => ({
      directions: s.directions,
      nearbyBuffer: s.nearbyBuffer,
      boundary: s.boundary,
    })),
  );
}

// ── GeoJSON Builders (pure helpers for the component) ────────────────

export function buildDirectionsGeoJSON(data: DirectionsLayerData): Feature {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: data.coordinates },
  };
}

export function buildNearbyBufferGeoJSON(data: NearbyBufferLayerData): Feature<Polygon> {
  return {
    type: 'Feature',
    properties: { radius: data.radiusMeters },
    geometry: { type: 'Polygon', coordinates: [data.ring] },
  };
}

export function buildBoundaryGeoJSON(data: BoundaryLayerData): Feature {
  return {
    type: 'Feature',
    properties: {},
    geometry: data.geom as Geometry,
  };
}
