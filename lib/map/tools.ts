/**
 * Map tool implementations — the functions invoked by the LLM's
 * function-call decisions. Each tool manipulates the MapLibre map instance.
 */

import { Map, Marker, Popup, LngLatBounds } from 'maplibre-gl';

import type { ToolResult, DirectionsMode, NearbyPlaceType } from '@/types';
import { DIRECTIONS_SOURCE_ID, DIRECTIONS_LAYER_ID, MAX_NEARBY_MARKERS } from './constants';
import { isCurrentLocationInput, getCurrentLocationCoordinates } from './geo';
import { buildPopupHtml, buildBoundaryPopupHtml, createNearbyMarkerElement } from './popup';
import { textSearch, fetchDirections, fetchNearbyPlaces } from './google-api';
import { findMatchingProvince, fetchProvinceBoundary } from './gtel-api';
import { clearAllMapVisuals, drawNearbyBuffer, drawBoundaryPolygon } from './visuals';
import { mapState } from './state';

// ── Resolve Helpers ──────────────────────────────────────────────────

async function resolveNearbySearchCenter(
  map: Map,
  location?: string,
): Promise<{ lat: number; lng: number; label: string }> {
  if (!location || !location.trim()) {
    const center = map.getCenter();
    return { lat: center.lat, lng: center.lng, label: 'tâm bản đồ hiện tại' };
  }

  if (isCurrentLocationInput(location)) {
    const current = await getCurrentLocationCoordinates();
    return { lat: current.lat, lng: current.lng, label: 'vị trí hiện tại của bạn' };
  }

  const resolved = await textSearch(location);
  return { lat: resolved.lat, lng: resolved.lng, label: resolved.displayName };
}

// ── Tool: searchPlace ────────────────────────────────────────────────

async function searchPlace(map: Map, args: { query: string }): Promise<ToolResult> {
  clearAllMapVisuals(map);
  mapState.lastNearbySearchContext = null;

  // ── Check for province/city boundary match (RGHC) ──────────────
  const matchedProvince = findMatchingProvince(args.query);
  if (matchedProvince) {
    return searchProvinceBoundary(map, matchedProvince.prov_code);
  }

  // ── Normal Google text search ──────────────────────────────────
  const location = await textSearch(args.query);
  const popupHtml = buildPopupHtml({
    name: location.name,
    address: location.address,
    rating: location.rating,
    userRatingsTotal: null,
    distanceMeters: null,
    types: location.types,
    openNow: null,
    photoUrl: location.photoUrl,
  });

  map.flyTo({ center: [location.lng, location.lat], zoom: 14, essential: true, duration: 2500 });

  mapState.searchPlaceMarker = new Marker({ color: '#4F46E5' })
    .setLngLat([location.lng, location.lat])
    .setPopup(
      new Popup({ offset: 22, className: 'gtel-google-popup', closeButton: false }).setHTML(
        popupHtml,
      ),
    )
    .addTo(map);

  mapState.searchPlaceMarker.togglePopup();

  return {
    success: true,
    message: `Đã tìm thấy "${args.query}" tại ${location.name}${location.address !== location.name ? ` (${location.address})` : ''}.`,
    data: {
      lng: location.lng,
      lat: location.lat,
      displayName: location.displayName,
      name: location.name,
      address: location.address,
      placeId: location.placeId,
      rating: location.rating,
      types: location.types,
      photoReference: location.photoReference,
      photoUrl: location.photoUrl,
    },
  };
}

// ── Tool: searchProvinceBoundary ─────────────────────────────────────

async function searchProvinceBoundary(map: Map, provCode: string): Promise<ToolResult> {
  const boundary = await fetchProvinceBoundary(provCode);

  // Draw the polygon boundary on the map
  drawBoundaryPolygon(map, boundary.geom, boundary.viewport);

  // Add a marker at the center with popup
  const popupHtml = buildBoundaryPopupHtml({
    name: boundary.prov_fname,
    nameEn: boundary.prov_fne,
    level: boundary.level,
    center: boundary.center,
  });

  mapState.searchPlaceMarker = new Marker({ color: '#4338CA' })
    .setLngLat([boundary.center.lng, boundary.center.lat])
    .setPopup(
      new Popup({ offset: 22, className: 'gtel-google-popup', closeButton: false }).setHTML(
        popupHtml,
      ),
    )
    .addTo(map);

  mapState.searchPlaceMarker.togglePopup();

  return {
    success: true,
    message: `Đã hiển thị ranh giới hành chính của ${boundary.prov_fname} (${boundary.prov_fne}) — ${boundary.level}.`,
    data: {
      provCode: boundary.prov_code,
      name: boundary.prov_fname,
      nameEn: boundary.prov_fne,
      level: boundary.level,
      center: boundary.center,
      viewport: boundary.viewport,
      geomLevel: boundary.geomLevel,
    },
  };
}

// ── Tool: getDirections ──────────────────────────────────────────────

async function getDirections(
  map: Map,
  args: { from: string; to: string; mode?: DirectionsMode },
): Promise<ToolResult> {
  clearAllMapVisuals(map);
  mapState.lastNearbySearchContext = null;

  const route = await fetchDirections(args.from, args.to, args.mode);

  map.addSource(DIRECTIONS_SOURCE_ID, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: route.coordinates },
    },
  });

  map.addLayer({
    id: DIRECTIONS_LAYER_ID,
    type: 'line',
    source: DIRECTIONS_SOURCE_ID,
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': '#2563EB', 'line-width': 5, 'line-opacity': 0.9 },
  });

  const startCoord = route.coordinates[0];
  const endCoord = route.coordinates[route.coordinates.length - 1];

  mapState.directionsStartMarker = new Marker({ color: '#22C55E' })
    .setLngLat(startCoord)
    .setPopup(
      new Popup({ closeButton: false }).setHTML(
        `<strong>Điểm đi:</strong><br/>${route.startAddress}`,
      ),
    )
    .addTo(map);

  mapState.directionsEndMarker = new Marker({ color: '#EF4444' })
    .setLngLat(endCoord)
    .setPopup(
      new Popup({ closeButton: false }).setHTML(
        `<strong>Điểm đến:</strong><br/>${route.endAddress}`,
      ),
    )
    .addTo(map);

  const bounds = route.coordinates.reduce(
    (acc, coord) => acc.extend(coord),
    new LngLatBounds(startCoord, startCoord),
  );
  map.fitBounds(bounds, { padding: 80, duration: 1000 });

  return {
    success: true,
    message:
      `Đã vẽ lộ trình ${route.modeLabel} từ "${args.from}" đến "${args.to}" ` +
      `(${route.distanceText}, khoảng ${route.durationText}).` +
      (route.modeNote ? ` ${route.modeNote}` : ''),
    data: {
      from: route.startAddress,
      to: route.endAddress,
      mode: route.mode,
      modeLabel: route.modeLabel,
      distanceText: route.distanceText,
      durationText: route.durationText,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      points: route.coordinates.length,
      modeNote: route.modeNote,
    },
  };
}

// ── Tool: nearbySearch ───────────────────────────────────────────────

async function nearbySearch(
  map: Map,
  args: {
    keyword?: string;
    type?: NearbyPlaceType;
    radius?: number;
    location?: string;
    minRating?: number;
  },
): Promise<ToolResult> {
  const keyword = args.keyword?.trim() || null;
  const type = args.type || null;
  const ctx = mapState.lastNearbySearchContext;
  const needsReuse = !keyword && !type && !!ctx;

  const effectiveKeyword = keyword || ctx?.keyword || undefined;
  const effectiveType = type || ctx?.type || undefined;
  const effectiveRadius =
    typeof args.radius === 'number' ? args.radius : needsReuse && ctx ? ctx.radius : undefined;
  const effectiveMinRating =
    typeof args.minRating === 'number'
      ? args.minRating
      : needsReuse && ctx && ctx.minRating !== null
        ? ctx.minRating
        : undefined;

  if (!effectiveKeyword && !effectiveType) {
    throw new Error(
      'Bạn chưa nêu rõ cần tìm gì lân cận. Hãy nói thêm từ khóa hoặc loại địa điểm (ví dụ: bãi gửi xe, quán cà phê).',
    );
  }

  const center =
    !args.location && needsReuse && ctx
      ? { lat: ctx.center.lat, lng: ctx.center.lng, label: ctx.label }
      : await resolveNearbySearchCenter(map, args.location);

  clearAllMapVisuals(map);

  const { radius, minRating, places, rawCount, filteredOutCount, ratingFilteredOutCount } =
    await fetchNearbyPlaces({
      location: { lat: center.lat, lng: center.lng },
      keyword: effectiveKeyword,
      type: effectiveType,
      radius: effectiveRadius,
      minRating: effectiveMinRating,
    });

  mapState.lastNearbySearchContext = {
    keyword: effectiveKeyword || null,
    type: effectiveType || null,
    radius,
    minRating,
    center: { lat: center.lat, lng: center.lng },
    label: center.label,
  };

  const bufferBounds = drawNearbyBuffer(map, { lng: center.lng, lat: center.lat }, radius);

  if (places.length === 0) {
    map.fitBounds(bufferBounds, { padding: 80, duration: 1000, maxZoom: 15 });
    return {
      success: true,
      message:
        `Không tìm thấy kết quả lân cận trong vùng buffer bán kính ${radius}m quanh ${center.label}.` +
        (rawCount > 0
          ? ` Google trả về ${rawCount} điểm nhưng không điểm nào đạt điều kiện lọc hiện tại.`
          : ''),
      data: {
        center,
        radius,
        bufferAreaKm2: Math.round(Math.PI * (radius / 1000) ** 2 * 100) / 100,
        keyword: effectiveKeyword || null,
        type: effectiveType || null,
        minRating,
        rawCount,
        filteredOutCount,
        ratingFilteredOutCount,
        totalFound: 0,
      },
    };
  }

  const visiblePlaces = places.slice(0, MAX_NEARBY_MARKERS);
  const bounds = new LngLatBounds(bufferBounds.getSouthWest(), bufferBounds.getNorthEast());

  visiblePlaces.forEach((place, index) => {
    const markerElement = createNearbyMarkerElement(place, index);
    const marker = new Marker({ element: markerElement, anchor: 'bottom' })
      .setLngLat([place.lng, place.lat])
      .setPopup(
        new Popup({ offset: 22, className: 'gtel-google-popup', closeButton: false }).setHTML(
          buildPopupHtml(place),
        ),
      )
      .addTo(map);

    mapState.nearbyPlaceMarkers.push(marker);
    bounds.extend([place.lng, place.lat]);
  });

  map.fitBounds(bounds, { padding: 80, duration: 1400, maxZoom: 16 });

  return {
    success: true,
    message:
      `Đã tìm thấy ${places.length} địa điểm lân cận trong bán kính ${radius}m quanh ${center.label}. ` +
      `Đang hiển thị ${visiblePlaces.length} điểm đầu tiên trên bản đồ.` +
      (minRating !== null ? ` Đang lọc từ ${minRating.toFixed(1)} sao trở lên.` : '') +
      (filteredOutCount > 0 ? ` Đã tự động lọc ${filteredOutCount} điểm ngoài buffer.` : ''),
    data: {
      center,
      radius,
      bufferAreaKm2: Math.round(Math.PI * (radius / 1000) ** 2 * 100) / 100,
      keyword: effectiveKeyword || null,
      type: effectiveType || null,
      minRating,
      rawCount,
      filteredOutCount,
      ratingFilteredOutCount,
      totalFound: places.length,
      shown: visiblePlaces.length,
      places: visiblePlaces.slice(0, 5).map((place) => ({
        name: place.name,
        address: place.address,
        rating: place.rating,
        userRatingsTotal: place.userRatingsTotal,
        openNow: place.openNow,
        businessStatus: place.businessStatus,
        distanceMeters: Math.round(place.distanceMeters),
        lat: place.lat,
        lng: place.lng,
        photoUrl: place.photoUrl,
      })),
    },
  };
}

// ── Tool: getUserLocation ────────────────────────────────────────────

async function getUserLocation(map: Map): Promise<ToolResult> {
  clearAllMapVisuals(map);
  mapState.lastNearbySearchContext = null;

  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ success: false, message: 'Trình duyệt hiện tại không hỗ trợ định vị GPS.' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { longitude, latitude } = position.coords;

        map.flyTo({ center: [longitude, latitude], zoom: 15, essential: true, duration: 2000 });

        mapState.userLocationMarker = new Marker({ color: '#10B981' })
          .setLngLat([longitude, latitude])
          .setPopup(
            new Popup({ closeButton: false }).setHTML('<strong>📍 Vị trí của bạn</strong>'),
          )
          .addTo(map);

        resolve({
          success: true,
          message: `Đã xác định vị trí của bạn: [${longitude.toFixed(4)}, ${latitude.toFixed(4)}]`,
          data: { lng: longitude, lat: latitude },
        });
      },
      (error) => {
        resolve({ success: false, message: `Lỗi định vị: ${error.message}` });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

// ── Tool: getMapCenter ───────────────────────────────────────────────

async function getMapCenter(map: Map): Promise<ToolResult> {
  const center = map.getCenter();
  const zoom = map.getZoom();

  return {
    success: true,
    message: `Tâm bản đồ hiện tại: [${center.lng.toFixed(4)}, ${center.lat.toFixed(4)}], mức zoom: ${zoom.toFixed(1)}.`,
    data: { lng: center.lng, lat: center.lat, zoom },
  };
}

// ── Tool Dispatcher ──────────────────────────────────────────────────

type ToolExecutor = (map: Map, args: Record<string, unknown>) => Promise<ToolResult>;

const TOOL_EXECUTORS: Record<string, ToolExecutor> = {
  searchPlace: (map, args) => searchPlace(map, args as { query: string }),
  getDirections: (map, args) =>
    getDirections(map, args as { from: string; to: string; mode?: DirectionsMode }),
  nearbySearch: (map, args) =>
    nearbySearch(
      map,
      args as {
        keyword?: string;
        type?: NearbyPlaceType;
        radius?: number;
        location?: string;
        minRating?: number;
      },
    ),
  getUserLocation: (map) => getUserLocation(map),
  getMapCenter: (map) => getMapCenter(map),
};

/**
 * Execute a tool by name with the given arguments.
 * Single entry point called by the frontend after receiving an LLM function-call response.
 */
export async function executeTool(
  map: Map,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const executor = TOOL_EXECUTORS[toolName];
  if (!executor) {
    return { success: false, message: `Không hỗ trợ công cụ "${toolName}".` };
  }

  try {
    return await executor(map, args);
  } catch (error) {
    return {
      success: false,
      message: `Công cụ "${toolName}" gặp lỗi: ${error instanceof Error ? error.message : 'Lỗi không xác định'}`,
    };
  }
}
