/**
 * MapView.tsx
 *
 * Full-screen map component using react-map-gl + MapLibre GL JS v5.
 * Exposes the underlying MapLibre map instance via a ref for tool execution.
 */

'use client';

import React, { useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import Map, {
  NavigationControl,
  ScaleControl,
  GeolocateControl,
  type MapRef,
} from 'react-map-gl/maplibre';

// re-export the raw MapLibre type so tools can use it
import type { Map as MaplibreMap, StyleSpecification } from 'maplibre-gl';

// ── Default map configuration ─────────────────────────────────────

const DEFAULT_CENTER: [number, number] = [108.16, 15.34];
const DEFAULT_ZOOM = 5;
const DEFAULT_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    google: {
      type: 'raster',
      tiles: ['https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'],
      tileSize: 256,
      attribution: '© Google',
    },
  },
  layers: [
    {
      id: 'google-layer',
      type: 'raster',
      source: 'google',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

/** Handle exposed to parent so the raw MapLibre instance can be shared */
export interface MapViewHandle {
  getMap: () => MaplibreMap | null;
}

export interface MapViewProps {
  onMapReady?: (map: MaplibreMap) => void;
}

const MapView = forwardRef<MapViewHandle, MapViewProps>(({ onMapReady }, ref) => {
  const mapRef = useRef<MapRef>(null);

  // Expose the underlying MapLibre map instance
  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current?.getMap() ?? null,
  }));

  // Notify parent when map instance is available
  const handleMapLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (map && onMapReady) {
      onMapReady(map);
    }
  }, [onMapReady]);

  return (
    <Map
      ref={mapRef}
      initialViewState={{
        longitude: DEFAULT_CENTER[0],
        latitude: DEFAULT_CENTER[1],
        zoom: DEFAULT_ZOOM,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle={DEFAULT_STYLE}
      onLoad={handleMapLoad}
      canvasContextAttributes={{ preserveDrawingBuffer: true }}
      hash={true}
    >
      <NavigationControl position='top-left' showCompass />
      <ScaleControl position='bottom-left' maxWidth={150} />
      <GeolocateControl
        position='top-left'
        positionOptions={{ enableHighAccuracy: true }}
        trackUserLocation={false}
      />
    </Map>
  );
});

MapView.displayName = 'MapView';

export default MapView;
