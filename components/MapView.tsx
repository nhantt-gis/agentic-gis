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
  type MapMouseEvent,
} from 'react-map-gl/maplibre';

// re-export the raw MapLibre type so tools can use it
import type { Map as MaplibreMap } from 'maplibre-gl';
import { GTEL_MAPS_API_KEY, GTEL_MAPS_STYLE_URL } from '@/lib/map/constants';
import { markerActions } from '@/lib/map/marker-store';
import MapMarkers from './MapMarkers';
import MapLayers from './MapLayers';

// ── Default map configuration ─────────────────────────────────────

const DEFAULT_CENTER: [number, number] = [108.16, 15.34];
const DEFAULT_ZOOM = 5;

/** Handle exposed to parent so the raw MapLibre instance can be shared */
export interface MapViewHandle {
  getMap: () => MaplibreMap | null;
}

export interface MapViewProps {
  onMapReady?: (map: MaplibreMap) => void;
}

const MapView = forwardRef<MapViewHandle, MapViewProps>(({ onMapReady }, ref) => {
  const mapRef = useRef<MapRef>(null);
  const mapStyle = new URL(GTEL_MAPS_STYLE_URL);
  mapStyle.searchParams.set('apikey', GTEL_MAPS_API_KEY!);

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

  const handleMapClick = useCallback((event: MapMouseEvent) => {
    const target = event.originalEvent.target;
    if (target instanceof HTMLElement) {
      if (
        target.closest('.maplibregl-marker') ||
        target.closest('.maplibregl-popup') ||
        target.closest('.maplibregl-ctrl')
      ) {
        return;
      }
    }
    markerActions.closePopup();
  }, []);

  return (
    <Map
      ref={mapRef}
      initialViewState={{
        longitude: DEFAULT_CENTER[0],
        latitude: DEFAULT_CENTER[1],
        zoom: DEFAULT_ZOOM,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle={mapStyle.toString()}
      onLoad={handleMapLoad}
      onClick={handleMapClick}
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
      <MapMarkers />
      <MapLayers />
    </Map>
  );
});

MapView.displayName = 'MapView';

export default MapView;
