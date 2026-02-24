/**
 * /maps — Map Copilot Demo Page
 *
 * Full-screen MapLibre map with a floating AI chat panel.
 * Users can control the map using natural language commands.
 */

'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { fetchProvinces } from '@/lib/map/gtel-api';

// Dynamic imports to avoid SSR issues with MapLibre
const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => (
    <div className='flex h-full w-full items-center justify-center bg-slate-900 text-base text-slate-400'>
      Loading map...
    </div>
  ),
});

const MapCopilot = dynamic(() => import('@/components/MapCopilot'), {
  ssr: false,
});

export default function MapsPage() {
  const mapInstanceRef = useRef<MaplibreMap | null>(null);

  // Fetch provinces list on page load for RGHC boundary matching
  useEffect(() => {
    fetchProvinces();
  }, []);

  const handleMapReady = useCallback((map: MaplibreMap) => {
    mapInstanceRef.current = map;
  }, []);

  return (
    <div className='fixed inset-0 flex flex-col bg-slate-900'>
      {/* Branding bar */}
      <header className='z-500 flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4'>
        <div className='flex items-center gap-2'>
          <span className='text-[22px]'>🌐</span>
          <span className='text-base font-extrabold tracking-tight text-slate-800'>GTEL Maps</span>
          <span className='rounded-full bg-linear-to-br from-indigo-600 to-violet-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white'>
            AI Copilot
          </span>
        </div>
        <div className='flex items-center'>
          <span className='text-xs text-gray-500 max-sm:hidden'>
            💡 Use the chat panel to control the map with natural language
          </span>
        </div>
      </header>

      {/* Map */}
      <div className='relative flex-1 overflow-hidden'>
        <MapView onMapReady={handleMapReady} />
      </div>

      {/* Copilot Chat */}
      <MapCopilot mapRef={mapInstanceRef} />
    </div>
  );
}
