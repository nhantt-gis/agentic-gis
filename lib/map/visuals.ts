/**
 * Map visual operations: layer/source management, marker cleanup,
 * and buffer drawing.
 */

import { Map, LngLatBounds } from 'maplibre-gl';
import type { Feature, Polygon } from 'geojson';

import {
  DIRECTIONS_SOURCE_ID,
  DIRECTIONS_LAYER_ID,
  NEARBY_BUFFER_SOURCE_ID,
  NEARBY_BUFFER_FILL_LAYER_ID,
  NEARBY_BUFFER_OUTLINE_LAYER_ID,
} from './constants';
import { buildBufferCoordinates } from './geo';
import { mapState } from './state';

// ── Layer / Source Cleanup ───────────────────────────────────────────

function removeLayerIfExists(map: Map, layerId: string): void {
  if (map.getLayer(layerId)) map.removeLayer(layerId);
}

function removeSourceIfExists(map: Map, sourceId: string): void {
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

// ── Nearby Visuals ───────────────────────────────────────────────────

function clearNearbyMarkers(): void {
  mapState.nearbyPlaceMarkers.forEach((marker) => marker.remove());
  mapState.nearbyPlaceMarkers = [];
}

function clearNearbyBuffer(map: Map): void {
  removeLayerIfExists(map, NEARBY_BUFFER_FILL_LAYER_ID);
  removeLayerIfExists(map, NEARBY_BUFFER_OUTLINE_LAYER_ID);
  removeSourceIfExists(map, NEARBY_BUFFER_SOURCE_ID);
}

export function clearNearbyVisuals(map: Map): void {
  clearNearbyMarkers();
  clearNearbyBuffer(map);
}

// ── Point Markers ────────────────────────────────────────────────────

function clearSearchPlaceMarker(): void {
  if (mapState.searchPlaceMarker) {
    mapState.searchPlaceMarker.remove();
    mapState.searchPlaceMarker = null;
  }
}

function clearUserLocationMarker(): void {
  if (mapState.userLocationMarker) {
    mapState.userLocationMarker.remove();
    mapState.userLocationMarker = null;
  }
}

function clearPointMarkers(): void {
  clearSearchPlaceMarker();
  clearUserLocationMarker();
}

// ── Directions Visuals ───────────────────────────────────────────────

export function clearDirectionsVisuals(map: Map): void {
  removeLayerIfExists(map, DIRECTIONS_LAYER_ID);
  removeSourceIfExists(map, DIRECTIONS_SOURCE_ID);

  if (mapState.directionsStartMarker) {
    mapState.directionsStartMarker.remove();
    mapState.directionsStartMarker = null;
  }
  if (mapState.directionsEndMarker) {
    mapState.directionsEndMarker.remove();
    mapState.directionsEndMarker = null;
  }
}

// ── Clear All ────────────────────────────────────────────────────────

export function clearAllMapVisuals(map: Map): void {
  clearDirectionsVisuals(map);
  clearNearbyVisuals(map);
  clearPointMarkers();
}

// ── Draw Buffer ──────────────────────────────────────────────────────

export function drawNearbyBuffer(
  map: Map,
  center: { lng: number; lat: number },
  radiusMeters: number,
): LngLatBounds {
  clearNearbyBuffer(map);

  const ring = buildBufferCoordinates(center, radiusMeters);
  const bufferGeoJson: Feature<Polygon> = {
    type: 'Feature',
    properties: { radius: radiusMeters },
    geometry: {
      type: 'Polygon',
      coordinates: [ring],
    },
  };

  map.addSource(NEARBY_BUFFER_SOURCE_ID, {
    type: 'geojson',
    data: bufferGeoJson,
  });

  map.addLayer({
    id: NEARBY_BUFFER_FILL_LAYER_ID,
    type: 'fill',
    source: NEARBY_BUFFER_SOURCE_ID,
    paint: {
      'fill-color': '#2563EB',
      'fill-opacity': 0.12,
    },
  });

  map.addLayer({
    id: NEARBY_BUFFER_OUTLINE_LAYER_ID,
    type: 'line',
    source: NEARBY_BUFFER_SOURCE_ID,
    paint: {
      'line-color': '#1D4ED8',
      'line-width': 2,
      'line-opacity': 0.8,
      'line-dasharray': [2, 2],
    },
  });

  return ring.reduce(
    (acc, coord) => acc.extend(coord),
    new LngLatBounds([center.lng, center.lat], [center.lng, center.lat]),
  );
}
