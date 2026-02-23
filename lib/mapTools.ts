/**
 * mapTools.ts
 *
 * Client-side Map Tool implementations.
 * Each function directly manipulates the MapLibre GL map instance.
 *
 * These tools are invoked by the frontend after the LLM returns a
 * function-call decision from the API route.
 */

import { Map, Marker, Popup, LngLatBounds } from 'maplibre-gl';
import type { Feature, Polygon } from 'geojson';

// ── Types ────────────────────────────────────────────────────────────

/** Result returned by every tool execution */
export interface ToolResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export type DirectionsMode = 'driving' | 'walking' | 'bicycling' | 'transit' | 'motorbike';
export type NearbyPlaceType =
  | 'restaurant'
  | 'cafe'
  | 'hotel'
  | 'hospital'
  | 'school'
  | 'atm'
  | 'pharmacy'
  | 'bank'
  | 'store'
  | 'gas_station'
  | 'tourist_attraction'
  | 'airport'
  | 'shopping_mall'
  | 'supermarket';

export const TOOL_ACTION_LABELS: Record<string, string> = {
  searchPlace: 'tìm địa điểm',
  getDirections: 'vẽ chỉ đường',
  nearbySearch: 'tìm địa điểm lân cận',
  getUserLocation: 'xác định vị trí của bạn',
  getMapCenter: 'lấy tâm bản đồ',
};

/** Map of tool name → executor function */
const TOOL_EXECUTORS: Record<
  string,
  (map: Map, args: Record<string, unknown>) => Promise<ToolResult>
> = {
  searchPlace: (map, args) => searchPlace(map, args as { query: string }),
  getDirections: (map, args) =>
    getDirections(map, args as { from: string; to: string; mode?: DirectionsMode }),
  nearbySearch: (map, args) =>
    nearbySearch(
      map,
      args as { keyword?: string; type?: NearbyPlaceType; radius?: number; location?: string },
    ),
  getUserLocation: (map) => getUserLocation(map),
  getMapCenter: (map) => getMapCenter(map),
};

// ── Environments ─────────────────────────────────────────────────────

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const GOOGLE_MAPS_PLACE_PHOTO_URL = 'https://maps.googleapis.com/maps/api/place/photo';
const GOOGLE_MAPS_DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
const GOOGLE_MAPS_NEARBY_SEARCH_URL =
  'https://maps.googleapis.com/maps/api/place/nearbysearch/json';

const DEFAULT_DIRECTIONS_MODE: DirectionsMode = 'driving';
const DIRECTIONS_SOURCE_ID = 'directions-route-source';
const DIRECTIONS_LAYER_ID = 'directions-route-layer';
const NEARBY_BUFFER_SOURCE_ID = 'nearby-buffer-source';
const NEARBY_BUFFER_FILL_LAYER_ID = 'nearby-buffer-fill-layer';
const NEARBY_BUFFER_OUTLINE_LAYER_ID = 'nearby-buffer-outline-layer';
const DEFAULT_LANGUAGE = 'vi';
const DEFAULT_NEARBY_RADIUS = 1000;
const MIN_NEARBY_RADIUS = 100;
const MAX_NEARBY_RADIUS = 50000;
const MAX_NEARBY_MARKERS = 12;
const EARTH_RADIUS_M = 6378137;
const BUFFER_SEGMENTS = 72;
const CURRENT_LOCATION_PATTERNS = [
  'vi tri hien tai',
  'vi tri cua toi',
  'vi tri cua minh',
  'noi toi dang dung',
  'noi toi dang o',
  'dia diem hien tai',
  'my current location',
  'current location',
  'my location',
  'where i am',
  'where i am now',
];

const DIRECTIONS_MODE_LABELS: Record<DirectionsMode, string> = {
  driving: 'ô tô',
  walking: 'đi bộ',
  bicycling: 'xe đạp',
  transit: 'phương tiện công cộng',
  motorbike: 'xe máy',
};

const GENERIC_PLACE_TYPES = new Set(['point_of_interest', 'establishment', 'premise', 'political']);

let directionsStartMarker: Marker | null = null;
let directionsEndMarker: Marker | null = null;
let nearbyPlaceMarkers: Marker[] = [];
let searchPlaceMarker: Marker | null = null;
let userLocationMarker: Marker | null = null;

interface GoogleTextSearchResponse {
  status?: string;
  error_message?: string;
  results?: Array<{
    place_id?: string;
    name?: string;
    formatted_address?: string;
    rating?: number;
    types?: string[];
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
    photos?: Array<{
      photo_reference?: string;
      height?: number;
      width?: number;
    }>;
  }>;
}

interface GoogleDirectionsResponse {
  status?: string;
  error_message?: string;
  routes?: Array<{
    overview_polyline?: { points?: string };
    legs?: Array<{
      distance?: { text?: string; value?: number };
      duration?: { text?: string; value?: number };
      start_address?: string;
      end_address?: string;
    }>;
  }>;
}

interface GoogleNearbySearchResponse {
  status?: string;
  error_message?: string;
  results?: Array<{
    place_id?: string;
    name?: string;
    vicinity?: string;
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
    business_status?: string;
    types?: string[];
    opening_hours?: {
      open_now?: boolean;
    };
    photos?: Array<{
      photo_reference?: string;
      height?: number;
      width?: number;
    }>;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
  }>;
}

interface ResolvedPlace {
  lng: number;
  lat: number;
  displayName: string;
  name: string;
  address: string;
  placeId: string | null;
  rating: number | null;
  types: string[];
  photoReference: string | null;
  photoUrl: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Search a place name using Google Places Text Search API.
 * Returns rich place metadata for map display.
 */
function createGooglePlacePhotoUrl(photoReference?: string | null, maxWidth = 640): string | null {
  if (!GOOGLE_MAPS_API_KEY || !photoReference) {
    return null;
  }

  const photo = new URL(GOOGLE_MAPS_PLACE_PHOTO_URL);
  photo.searchParams.set('maxwidth', String(maxWidth));
  photo.searchParams.set('photo_reference', photoReference);
  photo.searchParams.set('key', GOOGLE_MAPS_API_KEY);
  return photo.toString();
}

async function textSearch(query: string): Promise<ResolvedPlace> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error(
      'Thiếu NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Vui lòng cấu hình trong file .env.local.',
    );
  }

  const url = new URL(GOOGLE_MAPS_TEXT_SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('language', DEFAULT_LANGUAGE);
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'GTELMaps-Copilot/1.0' },
  });

  if (!res.ok) throw new Error(`Yêu cầu text search thất bại: ${res.status}`);

  const data: GoogleTextSearchResponse = await res.json();
  if (data.status === 'ZERO_RESULTS') throw new Error(`Không tìm thấy kết quả cho "${query}"`);
  if (data.status && data.status !== 'OK') {
    throw new Error(
      `Text Search lỗi (${data.status}): ${data.error_message || 'Không rõ nguyên nhân'}`,
    );
  }

  const result = data.results?.[0];
  if (!result) throw new Error(`Không tìm thấy kết quả cho "${query}"`);
  const lng = result.geometry?.location?.lng;
  const lat = result.geometry?.location?.lat;
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    throw new Error(`Không nhận được tọa độ hợp lệ cho "${query}".`);
  }

  const name = result.name?.trim() || query;
  const address = result.formatted_address?.trim() || name;
  const photoReference = result.photos?.[0]?.photo_reference?.trim() || null;
  const photoUrl = createGooglePlacePhotoUrl(photoReference, 640);

  return {
    lng,
    lat,
    displayName: address,
    name,
    address,
    placeId: result.place_id || null,
    rating: typeof result.rating === 'number' ? result.rating : null,
    types: result.types || [],
    photoReference,
    photoUrl,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatPrimaryPlaceType(types: string[]): string {
  const preferredType = types.find((type) => !GENERIC_PLACE_TYPES.has(type));
  if (!preferredType) {
    return 'Địa điểm';
  }
  return toTitleCase(preferredType.replace(/_/g, ' '));
}

function getRatingStarsHtml(rating: number): string {
  const roundedRating = Math.max(0, Math.min(5, Math.round(rating)));
  const filledStars = '★'.repeat(roundedRating);
  const emptyStars = '★'.repeat(5 - roundedRating);
  return `<span style="color:#F59E0B;">${filledStars}</span><span style="color:#D1D5DB;">${emptyStars}</span>`;
}

function buildPopupHtml(place: {
  name: string;
  address: string;
  rating: number | null;
  userRatingsTotal: number | null;
  distanceMeters: number | null;
  types: string[];
  openNow: boolean | null;
  photoUrl: string | null;
}): string {
  const safeName = escapeHtml(place.name);
  const safeAddress = escapeHtml(place.address);
  const typeLabel = formatPrimaryPlaceType(place.types);

  const imageSection = place.photoUrl
    ? `<img src="${place.photoUrl}" alt="${safeName}" style="display:block;width:100%;height:132px;object-fit:cover;" loading="lazy" />`
    : `<div style="height:132px;background:linear-gradient(135deg,#dbeafe 0%,#bfdbfe 45%,#93c5fd 100%);display:flex;align-items:center;justify-content:center;color:#2563EB;font-size:34px;">📍</div>`;

  const ratingSection =
    typeof place.rating === 'number'
      ? `<div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
          ${getRatingStarsHtml(place.rating)}
          <span style="font-size:12px;color:#4B5563;font-weight:600;">${place.rating.toFixed(1)}</span>
          ${
            typeof place.userRatingsTotal === 'number'
              ? `<span style="font-size:12px;color:#6B7280;">(${place.userRatingsTotal})</span>`
              : ''
          }
        </div>`
      : '';

  const openStatus =
    place.openNow === true
      ? '<div style="margin-top:4px;font-size:13px;font-weight:600;color:#10B981;">Đang mở cửa</div>'
      : place.openNow === false
        ? '<div style="margin-top:4px;font-size:13px;font-weight:600;color:#EF4444;">Hiện đang đóng cửa</div>'
        : '';
  const distanceInfo =
    typeof place.distanceMeters === 'number'
      ? `<div style="margin-top:2px;font-size:12px;color:#6B7280;">Cách ${(place.distanceMeters / 1000).toFixed(2)} km</div>`
      : '';

  return `<div style="width:350px;background:#FFFFFF;">
    ${imageSection}
    <div style="padding:12px 14px 14px;">
      <div style="font-size:20px;line-height:1.25;font-weight:600;color:#111827;word-break:break-word;">${safeName}</div>
      ${ratingSection}
      <div style="margin-top:4px;font-size:13px;color:#4B5563;">${escapeHtml(typeLabel)}</div>
      ${openStatus}
      <div style="margin-top:4px;font-size:12px;color:#6B7280;">${safeAddress}</div>
      ${distanceInfo}
    </div>
  </div>`;
}

function createNearbyMarkerElement(
  place: { name: string; photoUrl: string | null },
  index: number,
): HTMLElement {
  const element = document.createElement('div');
  element.className = 'gtel-nearby-marker';
  element.setAttribute('aria-label', `Địa điểm lân cận ${index + 1}: ${place.name}`);

  if (place.photoUrl) {
    const safePhotoUrl = place.photoUrl.replace(/"/g, '%22');
    element.style.backgroundImage = `linear-gradient(145deg, rgba(37, 99, 235, 0.2), rgba(37, 99, 235, 0.55)), url("${safePhotoUrl}")`;
  } else {
    element.style.backgroundImage = 'linear-gradient(145deg, #f59e0b, #f97316)';
  }

  return element;
}

function decodeGooglePolyline(encoded: string): Array<[number, number]> {
  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;

    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push([lng / 1e5, lat / 1e5]);
  }

  return coordinates;
}

function normalizeLocationText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function isCurrentLocationInput(value: string): boolean {
  const normalized = normalizeLocationText(value);
  return CURRENT_LOCATION_PATTERNS.some((pattern) => normalized.includes(pattern));
}

async function getCurrentLocationCoordinates(): Promise<{ lng: number; lat: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Trình duyệt hiện tại không hỗ trợ định vị GPS.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lng: position.coords.longitude,
          lat: position.coords.latitude,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(
            new Error(
              'Bạn đã từ chối quyền truy cập vị trí. Vui lòng cho phép định vị rồi thử lại.',
            ),
          );
          return;
        }
        reject(new Error(`Không thể lấy vị trí hiện tại: ${error.message}`));
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

function normalizeNearbyRadius(radius?: number): number {
  if (typeof radius !== 'number' || !Number.isFinite(radius)) {
    return DEFAULT_NEARBY_RADIUS;
  }
  return Math.min(MAX_NEARBY_RADIUS, Math.max(MIN_NEARBY_RADIUS, Math.round(radius)));
}

function clearNearbyMarkers(): void {
  nearbyPlaceMarkers.forEach((marker) => marker.remove());
  nearbyPlaceMarkers = [];
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

function buildBufferCoordinates(
  center: { lng: number; lat: number },
  radiusMeters: number,
): Array<[number, number]> {
  const coordinates: Array<[number, number]> = [];
  const angularDistance = radiusMeters / EARTH_RADIUS_M;
  const centerLatRad = toRadians(center.lat);
  const centerLngRad = toRadians(center.lng);

  for (let i = 0; i <= BUFFER_SEGMENTS; i += 1) {
    const bearing = (2 * Math.PI * i) / BUFFER_SEGMENTS;
    const sinLat =
      Math.sin(centerLatRad) * Math.cos(angularDistance) +
      Math.cos(centerLatRad) * Math.sin(angularDistance) * Math.cos(bearing);
    const latRad = Math.asin(sinLat);
    const lngRad =
      centerLngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(centerLatRad),
        Math.cos(angularDistance) - Math.sin(centerLatRad) * Math.sin(latRad),
      );

    coordinates.push([toDegrees(lngRad), toDegrees(latRad)]);
  }

  return coordinates;
}

function clearNearbyBuffer(map: Map): void {
  if (map.getLayer(NEARBY_BUFFER_FILL_LAYER_ID)) {
    map.removeLayer(NEARBY_BUFFER_FILL_LAYER_ID);
  }
  if (map.getLayer(NEARBY_BUFFER_OUTLINE_LAYER_ID)) {
    map.removeLayer(NEARBY_BUFFER_OUTLINE_LAYER_ID);
  }
  if (map.getSource(NEARBY_BUFFER_SOURCE_ID)) {
    map.removeSource(NEARBY_BUFFER_SOURCE_ID);
  }
}

function clearNearbyVisuals(map: Map): void {
  clearNearbyMarkers();
  clearNearbyBuffer(map);
}

function clearSearchPlaceMarker(): void {
  if (searchPlaceMarker) {
    searchPlaceMarker.remove();
    searchPlaceMarker = null;
  }
}

function clearUserLocationMarker(): void {
  if (userLocationMarker) {
    userLocationMarker.remove();
    userLocationMarker = null;
  }
}

function clearPointMarkers(): void {
  clearSearchPlaceMarker();
  clearUserLocationMarker();
}

function drawNearbyBuffer(
  map: Map,
  center: { lng: number; lat: number },
  radiusMeters: number,
): LngLatBounds {
  clearNearbyBuffer(map);

  const ring = buildBufferCoordinates(center, radiusMeters);
  const bufferGeoJson: Feature<Polygon> = {
    type: 'Feature',
    properties: {
      radius: radiusMeters,
    },
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

function haversineDistanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

async function resolveNearbySearchCenter(
  map: Map,
  location?: string,
): Promise<{ lat: number; lng: number; label: string }> {
  if (!location || !location.trim()) {
    const center = map.getCenter();
    return {
      lat: center.lat,
      lng: center.lng,
      label: 'tâm bản đồ hiện tại',
    };
  }

  if (isCurrentLocationInput(location)) {
    const current = await getCurrentLocationCoordinates();
    return {
      lat: current.lat,
      lng: current.lng,
      label: 'vị trí hiện tại của bạn',
    };
  }

  const resolved = await textSearch(location);
  return {
    lat: resolved.lat,
    lng: resolved.lng,
    label: resolved.displayName,
  };
}

function clearDirectionsVisuals(map: Map): void {
  if (map.getLayer(DIRECTIONS_LAYER_ID)) {
    map.removeLayer(DIRECTIONS_LAYER_ID);
  }
  if (map.getSource(DIRECTIONS_SOURCE_ID)) {
    map.removeSource(DIRECTIONS_SOURCE_ID);
  }

  if (directionsStartMarker) {
    directionsStartMarker.remove();
    directionsStartMarker = null;
  }
  if (directionsEndMarker) {
    directionsEndMarker.remove();
    directionsEndMarker = null;
  }
}

function clearAllMapVisuals(map: Map): void {
  clearDirectionsVisuals(map);
  clearNearbyVisuals(map);
  clearPointMarkers();
}

function normalizeDirectionsMode(mode?: string): DirectionsMode {
  if (!mode) {
    return DEFAULT_DIRECTIONS_MODE;
  }

  const normalized = mode.trim().toLowerCase();
  if (normalized === 'driving') return 'driving';
  if (normalized === 'walking') return 'walking';
  if (normalized === 'bicycling') return 'bicycling';
  if (normalized === 'transit') return 'transit';
  if (normalized === 'motorbike') return 'motorbike';
  return DEFAULT_DIRECTIONS_MODE;
}

function toGoogleDirectionsMode(
  mode: DirectionsMode,
): 'driving' | 'walking' | 'bicycling' | 'transit' {
  // Google Directions API does not support a dedicated "motorbike" mode.
  if (mode === 'motorbike') {
    return 'driving';
  }
  return mode;
}

async function fetchDirections(
  from: string,
  to: string,
  mode?: string,
): Promise<{
  coordinates: Array<[number, number]>;
  distanceText: string;
  distanceMeters: number | null;
  durationText: string;
  durationSeconds: number | null;
  startAddress: string;
  endAddress: string;
  mode: DirectionsMode;
  modeLabel: string;
  modeNote: string | null;
}> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error(
      'Thiếu NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Vui lòng cấu hình trong file .env.local.',
    );
  }

  const fromIsCurrent = isCurrentLocationInput(from);
  const toIsCurrent = isCurrentLocationInput(to);
  let currentLocation: { lng: number; lat: number } | null = null;

  if (fromIsCurrent || toIsCurrent) {
    currentLocation = await getCurrentLocationCoordinates();
  }

  const resolvedFrom =
    fromIsCurrent && currentLocation ? `${currentLocation.lat},${currentLocation.lng}` : from;
  const resolvedTo =
    toIsCurrent && currentLocation ? `${currentLocation.lat},${currentLocation.lng}` : to;

  const url = new URL(GOOGLE_MAPS_DIRECTIONS_URL);
  const normalizedMode = normalizeDirectionsMode(mode);
  const googleMode = toGoogleDirectionsMode(normalizedMode);
  url.searchParams.set('origin', resolvedFrom);
  url.searchParams.set('destination', resolvedTo);
  url.searchParams.set('mode', googleMode);
  url.searchParams.set('language', DEFAULT_LANGUAGE);
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'GTELMaps-Copilot/1.0' },
  });

  if (!res.ok) {
    throw new Error(`Yêu cầu chỉ đường thất bại: ${res.status}`);
  }

  const data: GoogleDirectionsResponse = await res.json();
  if (data.status === 'ZERO_RESULTS') {
    throw new Error(`Không tìm thấy lộ trình từ "${from}" đến "${to}".`);
  }
  if (data.status && data.status !== 'OK') {
    throw new Error(
      `Directions lỗi (${data.status}): ${data.error_message || 'Không rõ nguyên nhân'}`,
    );
  }

  const route = data.routes?.[0];
  const leg = route?.legs?.[0];
  const encodedPolyline = route?.overview_polyline?.points;
  if (!route || !leg || !encodedPolyline) {
    throw new Error(`Không nhận được dữ liệu lộ trình hợp lệ từ "${from}" đến "${to}".`);
  }

  const coordinates = decodeGooglePolyline(encodedPolyline);
  if (coordinates.length < 2) {
    throw new Error(`Không thể giải mã tuyến đường từ "${from}" đến "${to}".`);
  }

  return {
    coordinates,
    distanceText: leg.distance?.text || 'không rõ',
    distanceMeters: leg.distance?.value ?? null,
    durationText: leg.duration?.text || 'không rõ',
    durationSeconds: leg.duration?.value ?? null,
    startAddress: fromIsCurrent ? 'Vị trí hiện tại của bạn' : leg.start_address || from,
    endAddress: toIsCurrent ? 'Vị trí hiện tại của bạn' : leg.end_address || to,
    mode: normalizedMode,
    modeLabel: DIRECTIONS_MODE_LABELS[normalizedMode],
    modeNote:
      normalizedMode === 'motorbike'
        ? 'Google Directions không có mode xe máy riêng, nên hệ thống đang ước tính theo mode lái xe.'
        : null,
  };
}

async function fetchNearbyPlaces(args: {
  location: { lat: number; lng: number };
  keyword?: string;
  type?: NearbyPlaceType;
  radius?: number;
}): Promise<{
  radius: number;
  rawCount: number;
  filteredOutCount: number;
  places: Array<{
    id: string;
    name: string;
    address: string;
    rating: number | null;
    userRatingsTotal: number | null;
    businessStatus: string | null;
    openNow: boolean | null;
    types: string[];
    lat: number;
    lng: number;
    distanceMeters: number;
    photoReference: string | null;
    photoUrl: string | null;
  }>;
}> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error(
      'Thiếu NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Vui lòng cấu hình trong file .env.local.',
    );
  }

  const keyword = args.keyword?.trim();
  const type = args.type?.trim();
  if (!keyword && !type) {
    throw new Error('Bạn cần cung cấp ít nhất một điều kiện tìm kiếm: keyword hoặc type.');
  }

  const radius = normalizeNearbyRadius(args.radius);
  const url = new URL(GOOGLE_MAPS_NEARBY_SEARCH_URL);
  url.searchParams.set('location', `${args.location.lat},${args.location.lng}`);
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('language', DEFAULT_LANGUAGE);
  url.searchParams.set('key', GOOGLE_MAPS_API_KEY);
  if (keyword) {
    url.searchParams.set('keyword', keyword);
  }
  if (type) {
    url.searchParams.set('type', type);
  }

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'GTELMaps-Copilot/1.0' },
  });

  if (!res.ok) {
    throw new Error(`Yêu cầu nearby search thất bại: ${res.status}`);
  }

  const data: GoogleNearbySearchResponse = await res.json();
  if (data.status === 'ZERO_RESULTS') {
    return { radius, rawCount: 0, filteredOutCount: 0, places: [] };
  }
  if (data.status && data.status !== 'OK') {
    throw new Error(
      `Nearby search lỗi (${data.status}): ${data.error_message || 'Không rõ nguyên nhân'}`,
    );
  }

  const parsedPlaces =
    data.results
      ?.map((item) => ({
        id: item.place_id || `${item.name || 'place'}-${Math.random().toString(36).slice(2, 8)}`,
        name: item.name || 'Địa điểm',
        address: item.vicinity || item.formatted_address || 'Không có địa chỉ',
        rating: typeof item.rating === 'number' ? item.rating : null,
        userRatingsTotal:
          typeof item.user_ratings_total === 'number' ? item.user_ratings_total : null,
        businessStatus: item.business_status || null,
        openNow:
          typeof item.opening_hours?.open_now === 'boolean' ? item.opening_hours.open_now : null,
        types: item.types || [],
        lat: item.geometry?.location?.lat ?? Number.NaN,
        lng: item.geometry?.location?.lng ?? Number.NaN,
        photoReference: item.photos?.[0]?.photo_reference?.trim() || null,
      }))
      .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng))
      .map((place) => ({
        ...place,
        photoUrl: createGooglePlacePhotoUrl(place.photoReference, 640),
      })) || [];

  const places = parsedPlaces
    .map((place) => ({
      ...place,
      distanceMeters: haversineDistanceMeters(args.location, { lat: place.lat, lng: place.lng }),
    }))
    .filter((place) => place.distanceMeters <= radius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  return {
    radius,
    rawCount: parsedPlaces.length,
    filteredOutCount: parsedPlaces.length - places.length,
    places,
  };
}

// ── Tool Implementations ─────────────────────────────────────────────

/**
 * Search a place by name and fly there.
 */
export async function searchPlace(map: Map, args: { query: string }): Promise<ToolResult> {
  clearAllMapVisuals(map);
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

  map.flyTo({
    center: [location.lng, location.lat],
    zoom: 14,
    essential: true,
    duration: 2500,
  });

  // Add a temporary marker
  searchPlaceMarker = new Marker({ color: '#4F46E5' })
    .setLngLat([location.lng, location.lat])
    .setPopup(
      new Popup({ offset: 22, className: 'gtel-google-popup', closeButton: false }).setHTML(
        popupHtml,
      ),
    )
    .addTo(map);

  // Auto-open popup
  searchPlaceMarker.togglePopup();

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

/**
 * Find driving directions between two places and draw route on map.
 */
export async function getDirections(
  map: Map,
  args: { from: string; to: string; mode?: DirectionsMode },
): Promise<ToolResult> {
  clearAllMapVisuals(map);
  const route = await fetchDirections(args.from, args.to, args.mode);

  map.addSource(DIRECTIONS_SOURCE_ID, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: route.coordinates,
      },
    },
  });

  map.addLayer({
    id: DIRECTIONS_LAYER_ID,
    type: 'line',
    source: DIRECTIONS_SOURCE_ID,
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
    },
    paint: {
      'line-color': '#2563EB',
      'line-width': 5,
      'line-opacity': 0.9,
    },
  });

  const startCoord = route.coordinates[0];
  const endCoord = route.coordinates[route.coordinates.length - 1];

  directionsStartMarker = new Marker({ color: '#22C55E' })
    .setLngLat(startCoord)
    .setPopup(
      new Popup({ closeButton: false }).setHTML(
        `<strong>Điểm đi:</strong><br/>${route.startAddress}`,
      ),
    )
    .addTo(map);
  directionsEndMarker = new Marker({ color: '#EF4444' })
    .setLngLat(endCoord)
    .setPopup(
      new Popup({ closeButton: false }).setHTML(
        `<strong>Điểm đến:</strong><br/>${route.endAddress}`,
      ),
    )
    .addTo(map);

  const bounds = route.coordinates.reduce(
    (acc, coord) => acc.extend(coord),
    new LngLatBounds(route.coordinates[0], route.coordinates[0]),
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

/**
 * Search nearby places by keyword/type around map center, current location, or custom location.
 */
export async function nearbySearch(
  map: Map,
  args: { keyword?: string; type?: NearbyPlaceType; radius?: number; location?: string },
): Promise<ToolResult> {
  clearAllMapVisuals(map);
  const center = await resolveNearbySearchCenter(map, args.location);
  const { radius, places, rawCount, filteredOutCount } = await fetchNearbyPlaces({
    location: { lat: center.lat, lng: center.lng },
    keyword: args.keyword,
    type: args.type,
    radius: args.radius,
  });

  const bufferBounds = drawNearbyBuffer(map, { lng: center.lng, lat: center.lat }, radius);

  if (places.length === 0) {
    map.fitBounds(bufferBounds, { padding: 80, duration: 1000, maxZoom: 15 });

    return {
      success: true,
      message:
        `Không tìm thấy kết quả lân cận trong vùng buffer bán kính ${radius}m quanh ${center.label}.` +
        (rawCount > 0 ? ` Google trả về ${rawCount} điểm nhưng đều nằm ngoài buffer đã chọn.` : ''),
      data: {
        center,
        radius,
        bufferAreaKm2: Math.round(Math.PI * (radius / 1000) ** 2 * 100) / 100,
        keyword: args.keyword || null,
        type: args.type || null,
        rawCount,
        filteredOutCount,
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

    nearbyPlaceMarkers.push(marker);
    bounds.extend([place.lng, place.lat]);
  });

  map.fitBounds(bounds, { padding: 80, duration: 1400, maxZoom: 16 });

  return {
    success: true,
    message:
      `Đã tìm thấy ${places.length} địa điểm lân cận trong bán kính ${radius}m quanh ${center.label}. ` +
      `Đang hiển thị ${visiblePlaces.length} điểm đầu tiên trên bản đồ.` +
      (filteredOutCount > 0 ? ` Đã tự động lọc ${filteredOutCount} điểm ngoài buffer.` : ''),
    data: {
      center,
      radius,
      bufferAreaKm2: Math.round(Math.PI * (radius / 1000) ** 2 * 100) / 100,
      keyword: args.keyword || null,
      type: args.type || null,
      rawCount,
      filteredOutCount,
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

/**
 * Get the user's current GPS location and fly there.
 */
export async function getUserLocation(map: Map): Promise<ToolResult> {
  clearAllMapVisuals(map);
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({
        success: false,
        message: 'Trình duyệt hiện tại không hỗ trợ định vị GPS.',
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { longitude, latitude } = position.coords;

        map.flyTo({
          center: [longitude, latitude],
          zoom: 15,
          essential: true,
          duration: 2000,
        });

        // Add a pulsing marker at user location
        userLocationMarker = new Marker({ color: '#10B981' })
          .setLngLat([longitude, latitude])
          .setPopup(new Popup({ closeButton: false }).setHTML('<strong>📍 Vị trí của bạn</strong>'))
          .addTo(map);

        resolve({
          success: true,
          message: `Đã xác định vị trí của bạn: [${longitude.toFixed(4)}, ${latitude.toFixed(4)}]`,
          data: { lng: longitude, lat: latitude },
        });
      },
      (error) => {
        resolve({
          success: false,
          message: `Lỗi định vị: ${error.message}`,
        });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

/**
 * Get the current map center and zoom.
 */
export async function getMapCenter(map: Map): Promise<ToolResult> {
  const center = map.getCenter();
  const zoom = map.getZoom();

  return {
    success: true,
    message: `Tâm bản đồ hiện tại: [${center.lng.toFixed(4)}, ${center.lat.toFixed(4)}], mức zoom: ${zoom.toFixed(1)}.`,
    data: { lng: center.lng, lat: center.lat, zoom },
  };
}

// ── Tool Dispatcher ──────────────────────────────────────────────────

/**
 * Execute a tool by name with the given arguments.
 * This is the single entry point called by the frontend after receiving
 * an LLM function-call response.
 */
export async function executeTool(
  map: Map,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const executor = TOOL_EXECUTORS[toolName];
  if (!executor) {
    return {
      success: false,
      message: `Không hỗ trợ công cụ "${toolName}".`,
    };
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
