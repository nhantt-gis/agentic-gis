/**
 * MapLayers — Declarative React layer for all GeoJSON sources & layers.
 *
 * Renders inside react-map-gl's <Map> component.
 * Reads data from the layer store (written by tool executions).
 */

'use client';

import React, { useMemo } from 'react';
import { Source, Layer } from 'react-map-gl/maplibre';
import type { FillLayerSpecification, LineLayerSpecification } from 'react-map-gl/maplibre';
import {
  useMapLayers,
  buildDirectionsGeoJSON,
  buildNearbyBufferGeoJSON,
  buildBoundaryGeoJSON,
} from '@/lib/map/layer-store';
import {
  DIRECTIONS_SOURCE_ID,
  DIRECTIONS_LAYER_ID,
  NEARBY_BUFFER_SOURCE_ID,
  NEARBY_BUFFER_FILL_LAYER_ID,
  NEARBY_BUFFER_OUTLINE_LAYER_ID,
  BOUNDARY_SOURCE_ID,
  BOUNDARY_FILL_LAYER_ID,
  BOUNDARY_OUTLINE_LAYER_ID,
} from '@/lib/map/constants';

// ── Layer Style Definitions ──────────────────────────────────────────

const directionsLayerStyle: LineLayerSpecification = {
  id: DIRECTIONS_LAYER_ID,
  type: 'line',
  source: DIRECTIONS_SOURCE_ID,
  layout: { 'line-join': 'round', 'line-cap': 'round' },
  paint: { 'line-color': '#2563EB', 'line-width': 5, 'line-opacity': 0.9 },
};

const nearbyBufferFillStyle: FillLayerSpecification = {
  id: NEARBY_BUFFER_FILL_LAYER_ID,
  type: 'fill',
  source: NEARBY_BUFFER_SOURCE_ID,
  paint: { 'fill-color': '#2563EB', 'fill-opacity': 0.12 },
};

const nearbyBufferOutlineStyle: LineLayerSpecification = {
  id: NEARBY_BUFFER_OUTLINE_LAYER_ID,
  type: 'line',
  source: NEARBY_BUFFER_SOURCE_ID,
  paint: {
    'line-color': '#1D4ED8',
    'line-width': 2,
    'line-opacity': 0.8,
    'line-dasharray': [2, 2],
  },
};

const boundaryFillStyle: FillLayerSpecification = {
  id: BOUNDARY_FILL_LAYER_ID,
  type: 'fill',
  source: BOUNDARY_SOURCE_ID,
  paint: { 'fill-color': '#4F46E5', 'fill-opacity': 0.15 },
};

const boundaryOutlineStyle: LineLayerSpecification = {
  id: BOUNDARY_OUTLINE_LAYER_ID,
  type: 'line',
  source: BOUNDARY_SOURCE_ID,
  paint: { 'line-color': '#4338CA', 'line-width': 2.5, 'line-opacity': 0.85 },
};

// ── Main Component ───────────────────────────────────────────────────

export default function MapLayers() {
  const layers = useMapLayers();

  // Memoize GeoJSON data to avoid creating new objects every render
  const directionsData = useMemo(
    () => (layers.directions ? buildDirectionsGeoJSON(layers.directions) : null),
    [layers.directions],
  );

  const nearbyBufferData = useMemo(
    () => (layers.nearbyBuffer ? buildNearbyBufferGeoJSON(layers.nearbyBuffer) : null),
    [layers.nearbyBuffer],
  );

  const boundaryData = useMemo(
    () => (layers.boundary ? buildBoundaryGeoJSON(layers.boundary) : null),
    [layers.boundary],
  );

  return (
    <>
      {/* ── Directions Route ───────────────────────────────────────── */}
      {directionsData && (
        <Source id={DIRECTIONS_SOURCE_ID} type="geojson" data={directionsData}>
          <Layer {...directionsLayerStyle} />
        </Source>
      )}

      {/* ── Nearby Search Buffer ───────────────────────────────────── */}
      {nearbyBufferData && (
        <Source id={NEARBY_BUFFER_SOURCE_ID} type="geojson" data={nearbyBufferData}>
          <Layer {...nearbyBufferFillStyle} />
          <Layer {...nearbyBufferOutlineStyle} />
        </Source>
      )}

      {/* ── Administrative Boundary ────────────────────────────────── */}
      {boundaryData && (
        <Source id={BOUNDARY_SOURCE_ID} type="geojson" data={boundaryData}>
          <Layer {...boundaryFillStyle} />
          <Layer {...boundaryOutlineStyle} />
        </Source>
      )}
    </>
  );
}
