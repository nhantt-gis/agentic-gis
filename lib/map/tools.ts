/**
 * Map tool implementations — the functions invoked by the LLM's
 * function-call decisions. Each tool manipulates the MapLibre map instance.
 */

import { Map, LngLatBounds } from 'maplibre-gl';

import type { ToolResult, DirectionsMode, NearbyPlaceType } from '@/types';
import {
  isCurrentLocationInput,
  getCurrentLocationCoordinates,
  normalizeLocationText,
  buildBufferCoordinates,
} from './geo';
import { textSearch, fetchDirections, fetchNearbyPlaces, type NearbyPlace } from './google-api';
import {
  findMatchingProvince,
  fetchProvinceBoundary,
  fetchNearbyCameras,
  fetchHRInfo,
  extractCoordsFromHRResponse,
} from './gtel-api';
import { markerActions } from './marker-store';
import { layerActions } from './layer-store';

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

const CAMERA_KEYWORD_PATTERNS = ['camera', 'camera giao thong', 'cam giao thong', 'traffic camera'];
const MAX_REQUESTED_NEARBY_RESULTS = 200;

function isCameraNearbyRequest(keyword?: string | null, type?: NearbyPlaceType | null): boolean {
  if (type === 'traffic_camera') return true;
  if (type) return false;
  if (!keyword) return false;

  const normalized = normalizeLocationText(keyword);
  return CAMERA_KEYWORD_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function normalizeNearbyLimit(limit: unknown): number | null {
  const numericLimit =
    typeof limit === 'number'
      ? limit
      : typeof limit === 'string' && limit.trim()
        ? Number(limit)
        : Number.NaN;

  if (!Number.isFinite(numericLimit)) return null;

  const rounded = Math.floor(numericLimit);
  if (rounded <= 0) return null;

  return Math.min(MAX_REQUESTED_NEARBY_RESULTS, rounded);
}

// ── Tool: searchPlace ────────────────────────────────────────────────

async function searchPlace(map: Map, args: { query: string }): Promise<ToolResult> {
  layerActions.clearAll();
  markerActions.clearAll();

  // ── Check for province/city boundary match (RGHC) ──────────────
  const matchedProvince = findMatchingProvince(args.query);
  if (matchedProvince) {
    return searchProvinceBoundary(map, matchedProvince.prov_code);
  }

  // ── Normal Google text search ──────────────────────────────────
  const location = await textSearch(args.query);

  map.flyTo({ center: [location.lng, location.lat], zoom: 14, essential: true, duration: 2500 });

  markerActions.setSearchPlace({
    lngLat: [location.lng, location.lat],
    color: '#4F46E5',
    popupData: {
      name: location.name,
      address: location.address,
      rating: location.rating,
      userRatingsTotal: null,
      distanceMeters: null,
      types: location.types,
      openNow: null,
      photoUrl: location.photoUrl,
    },
  });

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

  // Draw the polygon boundary on the map (via React store)
  layerActions.setBoundary({ geom: boundary.geom, viewport: boundary.viewport });

  // Fit to viewport if provided
  if (boundary.viewport) {
    const bounds = new LngLatBounds(
      [boundary.viewport.northeast.lng, boundary.viewport.northeast.lat],
      [boundary.viewport.southwest.lng, boundary.viewport.southwest.lat],
    );
    map.fitBounds(bounds, { padding: 60, duration: 2000 });
  }

  // Add a marker at the center with popup (via React store)
  markerActions.setBoundary({
    lngLat: [boundary.center.lng, boundary.center.lat],
    color: '#4338CA',
    popupData: {
      name: boundary.prov_fname,
      nameEn: boundary.prov_fne,
      level: boundary.level,
      center: boundary.center,
    },
  });

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
  layerActions.clearAll();
  markerActions.clearAll();

  const route = await fetchDirections(args.from, args.to, args.mode);

  // Draw direction route via React store
  layerActions.setDirections({ coordinates: route.coordinates });

  const startCoord = route.coordinates[0];
  const endCoord = route.coordinates[route.coordinates.length - 1];

  markerActions.setDirections(
    {
      lngLat: startCoord as [number, number],
      color: '#22C55E',
      label: 'Điểm đi:',
      address: route.startAddress,
    },
    {
      lngLat: endCoord as [number, number],
      color: '#EF4444',
      label: 'Điểm đến:',
      address: route.endAddress,
    },
  );

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
    limit?: number;
  },
): Promise<ToolResult> {
  const keyword = args.keyword?.trim() || null;
  const type = args.type || null;

  const effectiveKeyword = keyword || undefined;
  const effectiveType = type || undefined;
  const effectiveRadius = typeof args.radius === 'number' ? args.radius : undefined;
  const effectiveMinRating = typeof args.minRating === 'number' ? args.minRating : undefined;
  const requestedLimit = normalizeNearbyLimit(args.limit);
  const isTrafficCameraSearch = isCameraNearbyRequest(effectiveKeyword, effectiveType);
  const contextType = isTrafficCameraSearch ? 'traffic_camera' : effectiveType || null;

  if (!effectiveKeyword && !effectiveType) {
    throw new Error(
      'Bạn chưa nêu rõ cần tìm gì lân cận. Hãy nói thêm từ khóa hoặc loại địa điểm (ví dụ: bãi gửi xe, quán cà phê).',
    );
  }

  const center = await resolveNearbySearchCenter(map, args.location);

  layerActions.clearAll();
  markerActions.clearAll();

  let radius = 0;
  let minRating: number | null = null;
  let rawCount = 0;
  let filteredOutCount = 0;
  let ratingFilteredOutCount = 0;
  let places: NearbyPlace[] = [];

  if (isTrafficCameraSearch) {
    const cameraResult = await fetchNearbyCameras({
      location: { lat: center.lat, lng: center.lng },
      keyword: effectiveKeyword,
      radius: effectiveRadius,
    });

    radius = cameraResult.radius;
    rawCount = cameraResult.rawCount;
    filteredOutCount = cameraResult.filteredOutCount;
    places = cameraResult.cameras.map((camera) => ({
      id: camera.id,
      name: camera.name,
      address: camera.address,
      rating: null,
      userRatingsTotal: null,
      businessStatus: camera.cameraStatus,
      openNow: null,
      types: camera.types,
      lat: camera.lat,
      lng: camera.lng,
      distanceMeters: camera.distanceMeters,
      photoReference: null,
      photoUrl: camera.photoUrl,
    }));
  } else {
    const nearbyResult = await fetchNearbyPlaces({
      location: { lat: center.lat, lng: center.lng },
      keyword: effectiveKeyword,
      type: effectiveType,
      radius: effectiveRadius,
      minRating: effectiveMinRating,
    });

    radius = nearbyResult.radius;
    minRating = nearbyResult.minRating;
    rawCount = nearbyResult.rawCount;
    filteredOutCount = nearbyResult.filteredOutCount;
    ratingFilteredOutCount = nearbyResult.ratingFilteredOutCount;
    places = nearbyResult.places;
  }

  // Draw nearby buffer circle via React store
  const ring = buildBufferCoordinates({ lng: center.lng, lat: center.lat }, radius);
  layerActions.setNearbyBuffer({ ring, radiusMeters: radius });

  const bufferBounds = ring.reduce(
    (acc, coord) => acc.extend(coord),
    new LngLatBounds([center.lng, center.lat], [center.lng, center.lat]),
  );

  if (places.length === 0) {
    map.fitBounds(bufferBounds, { padding: 80, duration: 1000, maxZoom: 15 });
    return {
      success: true,
      message:
        `Không tìm thấy kết quả lân cận trong vùng buffer bán kính ${radius}m quanh ${center.label}.` +
        (rawCount > 0
          ? ` API trả về ${rawCount} điểm nhưng không điểm nào đạt điều kiện lọc hiện tại.`
          : ''),
      data: {
        center,
        radius,
        bufferAreaKm2: Math.round(Math.PI * (radius / 1000) ** 2 * 100) / 100,
        keyword: effectiveKeyword || null,
        type: contextType,
        minRating,
        requestedLimit,
        rawCount,
        filteredOutCount,
        ratingFilteredOutCount,
        totalFound: 0,
        shown: 0,
        places: [],
      },
    };
  }

  const visiblePlaces = requestedLimit === null ? places : places.slice(0, requestedLimit);
  const bounds = new LngLatBounds(bufferBounds.getSouthWest(), bufferBounds.getNorthEast());

  markerActions.setNearbyPlaces(
    visiblePlaces.map((place) => ({
      lngLat: [place.lng, place.lat] as [number, number],
      popupData: {
        name: place.name,
        address: place.address,
        rating: place.rating,
        userRatingsTotal: place.userRatingsTotal,
        distanceMeters: place.distanceMeters,
        types: place.types,
        openNow: place.openNow,
        photoUrl: place.photoUrl,
      },
      photoUrl: place.photoUrl,
      name: place.name,
    })),
  );

  visiblePlaces.forEach((place) => {
    bounds.extend([place.lng, place.lat]);
  });

  map.fitBounds(bounds, { padding: 80, duration: 1400, maxZoom: 16 });

  return {
    success: true,
    message:
      `Đã tìm thấy ${places.length} địa điểm lân cận trong bán kính ${radius}m quanh ${center.label}. ` +
      (requestedLimit === null
        ? `Đang hiển thị toàn bộ ${visiblePlaces.length} điểm trên bản đồ.`
        : `Theo yêu cầu, đang hiển thị ${visiblePlaces.length} điểm trên bản đồ.`),
    data: {
      center,
      radius,
      bufferAreaKm2: Math.round(Math.PI * (radius / 1000) ** 2 * 100) / 100,
      keyword: effectiveKeyword || null,
      type: contextType,
      minRating,
      requestedLimit,
      rawCount,
      filteredOutCount,
      ratingFilteredOutCount,
      totalFound: places.length,
      shown: visiblePlaces.length,
      places: visiblePlaces.map((place) => ({
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
  layerActions.clearAll();
  markerActions.clearAll();

  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ success: false, message: 'Trình duyệt hiện tại không hỗ trợ định vị GPS.' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { longitude, latitude } = position.coords;

        map.flyTo({ center: [longitude, latitude], zoom: 15, essential: true, duration: 2000 });

        markerActions.setUserLocation({ lngLat: [longitude, latitude] });

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

// ── Tool: askHR ──────────────────────────────────────────────────────

async function askHR(map: Map, args: { question: string }): Promise<ToolResult> {
  const hrResponse = await fetchHRInfo(args.question);
  const responseText = hrResponse.output;

  // Try to extract GPS coordinates from the response
  const coords = extractCoordsFromHRResponse(responseText);

  if (coords.length > 0) {
    // Clear previous markers/layers and show attendance locations
    layerActions.clearAll();
    markerActions.clearAll();

    markerActions.setNearbyPlaces(
      coords.map((coord, index) => ({
        lngLat: [coord.lng, coord.lat] as [number, number],
        popupData: {
          name: `Vị trí chấm công #${index + 1}`,
          address: `${coord.lat}, ${coord.lng}`,
          rating: null,
          userRatingsTotal: null,
          distanceMeters: null,
          types: ['attendance_location'],
          openNow: null,
          photoUrl: null,
        },
        photoUrl: null,
        name: `Vị trí chấm công #${index + 1}`,
      })),
    );

    // Fly to first coordinate or fit bounds if multiple
    if (coords.length === 1) {
      map.flyTo({
        center: [coords[0].lng, coords[0].lat],
        zoom: 16,
        essential: true,
        duration: 2000,
      });
    } else {
      const bounds = coords.reduce(
        (acc, coord) => acc.extend([coord.lng, coord.lat]),
        new LngLatBounds([coords[0].lng, coords[0].lat], [coords[0].lng, coords[0].lat]),
      );
      map.fitBounds(bounds, { padding: 80, duration: 2000, maxZoom: 16 });
    }

    return {
      success: true,
      message: responseText,
      data: {
        hrResponse: responseText,
        attendanceLocations: coords,
        shownOnMap: true,
      },
    };
  }

  // No coordinates — just return the HR response text (no map action)
  return {
    success: true,
    message: responseText,
    data: {
      hrResponse: responseText,
      shownOnMap: false,
    },
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
        limit?: number;
      },
    ),
  getUserLocation: (map) => getUserLocation(map),
  getMapCenter: (map) => getMapCenter(map),
  askHR: (map, args) => askHR(map, args as { question: string }),
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
