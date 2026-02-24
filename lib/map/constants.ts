/**
 * Map-related constants: API URLs, layer/source IDs, defaults, and labels.
 */

import type { DirectionsMode } from '@/types';

// ── Google Maps API ──────────────────────────────────────────────────

export const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
export const GOOGLE_MAPS_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
export const GOOGLE_MAPS_PLACE_PHOTO_URL = 'https://maps.googleapis.com/maps/api/place/photo';
export const GOOGLE_MAPS_DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
export const GOOGLE_MAPS_NEARBY_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/nearbysearch/json';

// ── GTEL Maps API ────────────────────────────────────────────────────
export const GTEL_MAPS_API_KEY = process.env.NEXT_PUBLIC_GTEL_MAPS_API_KEY;
export const GTEL_MAPS_STYLE_URL = 'https://maps.ots.vn/api/styles/v1/gtelmaps-streets-v1/style.json';
export const GTEL_ADMIN_PROVINCES_URL = 'https://maps.ots.vn/api/admin-unit/provinces';
export const GTEL_NEARBY_SEARCH_URL = 'https://maps.ots.vn/api/place/nearby-search';
export const GTEL_CAMERA_PHOTO_URL = 'https://maps.ots.vn/api/layers/v1/camera_pt';

// ── Map Layer / Source IDs ───────────────────────────────────────────

export const DIRECTIONS_SOURCE_ID = 'directions-route-source';
export const DIRECTIONS_LAYER_ID = 'directions-route-layer';
export const NEARBY_BUFFER_SOURCE_ID = 'nearby-buffer-source';
export const NEARBY_BUFFER_FILL_LAYER_ID = 'nearby-buffer-fill-layer';
export const NEARBY_BUFFER_OUTLINE_LAYER_ID = 'nearby-buffer-outline-layer';
export const BOUNDARY_SOURCE_ID = 'boundary-source';
export const BOUNDARY_FILL_LAYER_ID = 'boundary-fill-layer';
export const BOUNDARY_OUTLINE_LAYER_ID = 'boundary-outline-layer';

// ── Defaults ─────────────────────────────────────────────────────────

export const DEFAULT_DIRECTIONS_MODE: DirectionsMode = 'driving';
export const DEFAULT_LANGUAGE = 'vi';
export const DEFAULT_NEARBY_RADIUS = 1000;
export const MIN_NEARBY_RADIUS = 100;
export const MAX_NEARBY_RADIUS = 50000;
export const MAX_NEARBY_MARKERS = 12;

// ── Geo Constants ────────────────────────────────────────────────────

export const EARTH_RADIUS_M = 6378137;
export const BUFFER_SEGMENTS = 72;

// ── Locale Patterns ──────────────────────────────────────────────────

export const CURRENT_LOCATION_PATTERNS = [
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

// ── Labels ───────────────────────────────────────────────────────────

export const DIRECTIONS_MODE_LABELS: Record<DirectionsMode, string> = {
  driving: 'ô tô',
  walking: 'đi bộ',
  bicycling: 'xe đạp',
  transit: 'phương tiện công cộng',
  motorbike: 'xe máy',
};

export const TOOL_ACTION_LABELS: Record<string, string> = {
  searchPlace: 'tìm địa điểm',
  searchBoundary: 'tìm ranh giới hành chính',
  getDirections: 'vẽ chỉ đường',
  nearbySearch: 'tìm địa điểm lân cận',
  getUserLocation: 'xác định vị trí của bạn',
  getMapCenter: 'lấy tâm bản đồ',
};

export const GENERIC_PLACE_TYPES = new Set([
  'point_of_interest',
  'establishment',
  'premise',
  'political',
]);
