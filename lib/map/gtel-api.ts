/**
 * GTEL Maps API interaction layer.
 * Handles administrative boundary (RGHC) data: province list and boundary geometry.
 */

import {
  GTEL_ADMIN_PROVINCES_URL,
  GTEL_CAMERA_PHOTO_URL,
  GTEL_HR_API_URL,
  GTEL_MAPS_API_KEY,
  GTEL_NEARBY_SEARCH_URL,
} from './constants';
import { haversineDistanceMeters, normalizeNearbyRadius } from './geo';
import { mapState } from './map-store';

// ── Types ────────────────────────────────────────────────────────────

export interface Province {
  id: number;
  prov_code: string;
  prov_fname: string;
  prov_fne: string;
  level: string;
  sort: string;
}

export interface ProvinceBoundary {
  id: number;
  prov_code: string;
  prov_fname: string;
  prov_fne: string;
  level: string;
  geomLevel: string;
  center: { lat: number; lng: number };
  viewport: {
    northeast: { lat: number; lng: number };
    southwest: { lat: number; lng: number };
  };
  geom: {
    type: string;
    coordinates: number[][][][];
  };
}

interface ProvincesResponse {
  status: string;
  data: Province[];
  licence: string;
}

interface ProvinceBoundaryResponse {
  status: string;
  data: ProvinceBoundary;
  licence: string;
}

interface GtelNearbySearchResponse {
  statusCode: number;
  status: string;
  data: GtelNearbySearchItem[];
}

interface GtelNearbySearchItem {
  id?: string;
  types?: string[];
  formattedAddress?: string;
  plusCode?: {
    compoundCode?: string;
    globalCode?: string;
  };
  location?: {
    latitude?: number;
    longitude?: number;
  };
  displayName?: {
    text?: string;
    languageCode?: string;
  };
  extras?: {
    code?: string;
    cam_id?: string;
    cam_type?: string;
    cam_status?: string;
    ptz?: boolean;
    angle?: string;
  };
  distance?: number;
}

export interface NearbyCamera {
  id: string;
  name: string;
  address: string;
  types: string[];
  lat: number;
  lng: number;
  photoUrl: string | null;
  distanceMeters: number;
  cameraCode: string | null;
  cameraId: string | null;
  cameraType: string | null;
  cameraStatus: string | null;
  ptz: boolean | null;
  angle: string | null;
}

export interface NearbyCameraSearchResult {
  radius: number;
  rawCount: number;
  filteredOutCount: number;
  cameras: NearbyCamera[];
}

export interface HRApiResponse {
  output: string;
}

// ── Helpers ──────────────────────────────────────────────────────────

function assertApiKey(): string {
  if (!GTEL_MAPS_API_KEY) {
    throw new Error(
      'Thiếu NEXT_PUBLIC_GTEL_MAPS_API_KEY. Vui lòng cấu hình trong file .env.local.',
    );
  }
  return GTEL_MAPS_API_KEY;
}

function createGtelCameraPhotoUrl(cameraId?: string | null): string | null {
  if (!GTEL_MAPS_API_KEY || !cameraId) return null;

  const photo = new URL(GTEL_CAMERA_PHOTO_URL);
  photo.pathname += `/${cameraId}/snapshot.jpg`;
  photo.searchParams.set('apikey', GTEL_MAPS_API_KEY);
  return photo.toString();
}

async function fetchGtelApi<T>(url: URL, errorPrefix: string): Promise<T> {
  const res = await fetch(url.toString(), {
    headers: { 'app-version': '1.1' },
  });
  if (!res.ok) throw new Error(`${errorPrefix}: ${res.status}`);
  return res.json();
}

// ── Nearby Traffic Cameras ──────────────────────────────────────────

export async function fetchNearbyCameras(args: {
  location: { lat: number; lng: number };
  keyword?: string;
  radius?: number;
}): Promise<NearbyCameraSearchResult> {
  const apiKey = assertApiKey();
  const radius = normalizeNearbyRadius(args.radius);

  const url = new URL(GTEL_NEARBY_SEARCH_URL);
  url.searchParams.set('location', `${args.location.lat},${args.location.lng}`);
  url.searchParams.set('type', 'traffic_camera');
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('apikey', apiKey);

  const keyword = args.keyword?.trim();
  if (keyword) {
    url.searchParams.set('keyword', keyword);
  }

  const data = await fetchGtelApi<GtelNearbySearchResponse>(
    url,
    'Yêu cầu nearby camera giao thông thất bại',
  );

  const status = data.status || '';
  const ok = status.toUpperCase() === 'OK' || data.statusCode === 200;
  if (!ok) {
    throw new Error(`Nearby camera lỗi (${status || data.statusCode || 'UNKNOWN'}).`);
  }

  const parsed =
    data.data
      .map((item) => ({
        id: item.id || `traffic-camera-${Math.random().toString(36).slice(2, 8)}`,
        name: item.displayName?.text || 'Camera giao thông',
        address: item.formattedAddress || item.plusCode?.compoundCode || 'Không có địa chỉ',
        types: item.types || ['traffic_camera'],
        lat: item.location?.latitude ?? Number.NaN,
        lng: item.location?.longitude ?? Number.NaN,
        cameraCode: item.extras?.code || null,
        cameraId: item.extras?.cam_id || null,
        cameraType: item.extras?.cam_type || null,
        cameraStatus: item.extras?.cam_status || null,
        ptz: typeof item.extras?.ptz === 'boolean' ? item.extras.ptz : null,
        angle: item.extras?.angle || null,
      }))
      .filter((place) => Number.isFinite(place?.lat) && Number.isFinite(place?.lng))
      .map((place) => ({
        ...place,
        photoUrl: createGtelCameraPhotoUrl(place.cameraId),
      })) || [];

  const cameras = parsed
    .map((place) => ({
      ...place,
      distanceMeters: haversineDistanceMeters(args.location, { lat: place.lat, lng: place.lng }),
    }))
    .filter((camera) => camera.distanceMeters <= radius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  return {
    radius,
    rawCount: parsed.length,
    filteredOutCount: parsed.length - cameras.length,
    cameras,
  };
}

// ── Fetch Provinces ──────────────────────────────────────────────────

/**
 * Fetch the list of all provinces/cities from GTEL Maps API.
 * Stores the result in mapState.provinces for later matching.
 */
export async function fetchProvinces(): Promise<Province[]> {
  const apiKey = assertApiKey();

  const url = new URL(GTEL_ADMIN_PROVINCES_URL);
  url.searchParams.set('apikey', apiKey);

  const data = await fetchGtelApi<ProvincesResponse>(url, 'Yêu cầu danh sách tỉnh thành thất bại');

  if (data.status !== 'OK' || !Array.isArray(data.data)) {
    console.error('[gtel-api] Unexpected provinces response:', data);
    return [];
  }

  mapState.setProvinces(data.data);
  return data.data;
}

// ── Fetch Province Boundary ──────────────────────────────────────────

/**
 * Fetch boundary geometry for a specific province.
 */
export async function fetchProvinceBoundary(provCode: string): Promise<ProvinceBoundary> {
  const apiKey = assertApiKey();

  const url = new URL(GTEL_ADMIN_PROVINCES_URL);
  url.pathname += `/${provCode}`;
  url.searchParams.set('geom_level', 'street');
  url.searchParams.set('apikey', apiKey);

  const data = await fetchGtelApi<ProvinceBoundaryResponse>(
    url,
    'Yêu cầu ranh giới hành chính thất bại',
  );

  if (data.status !== 'OK' || !data.data) {
    throw new Error('Dữ liệu ranh giới hành chính không hợp lệ.');
  }

  return data.data;
}

// ── Province Matching ────────────────────────────────────────────────

/**
 * Normalize Vietnamese text: lowercase, remove diacritics, trim.
 */
function normalizeVN(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Prefixes to strip from province full names for matching */
const PROVINCE_PREFIXES = ['thanh pho', 'tinh', 'tp.', 'tp'];

/** Prefixes the user might include in their query */
const QUERY_PREFIXES = [
  'thanh pho',
  'tinh',
  'tp.',
  'tp ',
  'ranh gioi hanh chinh',
  'ranh gioi',
  'rghc',
  'boundary',
];

const BOUNDARY_INTENT_KEYWORDS = [
  'ranh gioi',
  'ranh gioi hanh chinh',
  'dia gioi',
  'dia gioi hanh chinh',
  'hanh chinh',
  'rghc',
  'boundary',
  'ban do hanh chinh',
];

/**
 * Strip known prefixes from a normalized string.
 */
function stripPrefixes(normalized: string, prefixes: string[]): string {
  let result = normalized;
  for (const prefix of prefixes) {
    if (result.startsWith(prefix)) {
      result = result.slice(prefix.length).trim();
      break;
    }
  }
  return result;
}

function containsWholePhrase(text: string, phrase: string): boolean {
  if (!phrase) return false;
  const paddedText = ` ${text} `;
  const paddedPhrase = ` ${phrase} `;
  return paddedText.includes(paddedPhrase);
}

function hasBoundaryIntent(normalizedQuery: string): boolean {
  return BOUNDARY_INTENT_KEYWORDS.some((kw) => normalizedQuery.includes(kw));
}

/**
 * Try to match a user search query against the provinces list.
 * Returns the matching province or null if no match found.
 *
 * Only matches province/city level. Does not match district or ward level.
 */
export function findMatchingProvince(query: string): Province | null {
  const provinces = mapState.provinces;
  if (!provinces || provinces.length === 0) return null;

  const normalizedQuery = normalizeVN(query);
  const strippedQuery = stripPrefixes(normalizedQuery, QUERY_PREFIXES);
  const boundaryIntent = hasBoundaryIntent(normalizedQuery);

  // If after stripping, query is empty, no match
  if (!strippedQuery) return null;

  for (const province of provinces) {
    const normalizedFname = normalizeVN(province.prov_fname);
    const strippedFname = stripPrefixes(normalizedFname, PROVINCE_PREFIXES);

    const normalizedFne = normalizeVN(province.prov_fne);

    // Exact match on full name
    if (normalizedQuery === normalizedFname || normalizedQuery === normalizedFne) {
      return province;
    }

    // Match stripped name (e.g., "ho chi minh" matches "thanh pho ho chi minh")
    if (strippedQuery === strippedFname) {
      return province;
    }

    // Match stripped query against full english name without common suffixes
    const strippedFne = normalizedFne.replace(/\s*(city|province)$/i, '').trim();
    if (strippedQuery === strippedFne) {
      return province;
    }

    // Boundary intent: allow query phrase to contain province/city name
    // Example: "xem ranh gioi cua tp ho chi minh"
    if (
      boundaryIntent &&
      (containsWholePhrase(normalizedQuery, strippedFname) ||
        containsWholePhrase(normalizedQuery, normalizedFname) ||
        containsWholePhrase(normalizedQuery, strippedFne) ||
        containsWholePhrase(normalizedQuery, normalizedFne))
    ) {
      return province;
    }
  }

  return null;
}

// ── HR / Employee API ────────────────────────────────────────────────

/**
 * Generate a session ID from the current date (YYYYMMDD format).
 */
function buildHRSessionId(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Call the GTEL OTS HR API to answer employee / attendance questions.
 */
export async function fetchHRInfo(question: string): Promise<HRApiResponse> {
  const sessionId = buildHRSessionId();

  const url = new URL(GTEL_HR_API_URL);
  url.searchParams.set('text', question);
  url.searchParams.set('session_id', sessionId);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Yêu cầu thông tin nhân sự thất bại: ${res.status}`);
  }

  const data: HRApiResponse = await res.json();
  if (!data.output) {
    throw new Error('Phản hồi từ hệ thống nhân sự không hợp lệ.');
  }

  return data;
}

/**
 * Extract GPS coordinates from the HR API response text.
 * Looks for patterns like "GPS (lat, lng)" or "(lat, lng)" where lat/lng are decimal numbers.
 * Returns all unique coordinate pairs found.
 */
export function extractCoordsFromHRResponse(
  text: string,
): Array<{ lat: number; lng: number }> {
  const coords: Array<{ lat: number; lng: number }> = [];
  const seen = new Set<string>();

  // Match patterns: GPS (lat, lng) or GPS(lat, lng) — the most explicit form
  const gpsPattern = /GPS\s*\(\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\)/gi;
  let match: RegExpExecArray | null;

  while ((match = gpsPattern.exec(text)) !== null) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const key = `${lat},${lng}`;
      if (!seen.has(key)) {
        seen.add(key);
        coords.push({ lat, lng });
      }
    }
  }

  return coords;
}

/**
 * Extract a meaningful address from the HR API response text.
 * Looks for "địa chỉ:" or "địa chỉ" patterns followed by the address string.
 * Returns the first address found, or null.
 */
export function extractAddressFromHRResponse(text: string): string | null {
  // Match "địa chỉ: <address>" or "địa chỉ <address>" (case-insensitive, with optional ** markdown bold)
  const addressPattern = /(?:địa\s*chỉ|đ\/c)\s*[:：]\s*\**\s*(.+?)(?:\*\*|\.|\n|$)/i;
  const match = addressPattern.exec(text);
  if (match) {
    const address = match[1]
      .replace(/\*+/g, '')
      .replace(/^\s*[:：]\s*/, '')
      .trim();
    if (address.length > 5) return address;
  }

  return null;
}
