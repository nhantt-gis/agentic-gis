/**
 * Google Maps API interaction layer.
 * Handles text search, directions, and nearby search requests.
 */

import type { DirectionsMode, NearbyPlaceType } from '@/types';
import {
  GOOGLE_MAPS_API_KEY,
  GOOGLE_MAPS_TEXT_SEARCH_URL,
  GOOGLE_MAPS_PLACE_PHOTO_URL,
  GOOGLE_MAPS_DIRECTIONS_URL,
  GOOGLE_MAPS_NEARBY_SEARCH_URL,
  DEFAULT_LANGUAGE,
  DIRECTIONS_MODE_LABELS,
} from './constants';
import {
  isCurrentLocationInput,
  getCurrentLocationCoordinates,
  normalizeDirectionsMode,
  toGoogleDirectionsMode,
  decodeGooglePolyline,
  normalizeNearbyRadius,
  normalizeMinRating,
  haversineDistanceMeters,
} from './geo';

// ── Google API Response Types ────────────────────────────────────────

interface GoogleTextSearchResponse {
  status?: string;
  error_message?: string;
  results?: Array<{
    place_id?: string;
    name?: string;
    formatted_address?: string;
    rating?: number;
    types?: string[];
    geometry?: { location?: { lat?: number; lng?: number } };
    photos?: Array<{ photo_reference?: string; height?: number; width?: number }>;
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
    opening_hours?: { open_now?: boolean };
    photos?: Array<{ photo_reference?: string; height?: number; width?: number }>;
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
}

// ── Public Result Types ──────────────────────────────────────────────

export interface ResolvedPlace {
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

export interface DirectionsResult {
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
}

export interface NearbyPlace {
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
}

export interface NearbySearchResult {
  radius: number;
  minRating: number | null;
  rawCount: number;
  filteredOutCount: number;
  ratingFilteredOutCount: number;
  places: NearbyPlace[];
}

// ── Helpers ──────────────────────────────────────────────────────────

function assertApiKey(): string {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error(
      'Thiếu NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Vui lòng cấu hình trong file .env.local.',
    );
  }
  return GOOGLE_MAPS_API_KEY;
}

function createGooglePlacePhotoUrl(photoReference?: string | null, maxWidth = 640): string | null {
  if (!GOOGLE_MAPS_API_KEY || !photoReference) return null;

  const photo = new URL(GOOGLE_MAPS_PLACE_PHOTO_URL);
  photo.searchParams.set('maxwidth', String(maxWidth));
  photo.searchParams.set('photo_reference', photoReference);
  photo.searchParams.set('key', GOOGLE_MAPS_API_KEY);
  return photo.toString();
}

async function fetchGoogleApi<T>(url: URL, errorPrefix: string): Promise<T> {
  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'GTELMaps-Copilot/1.0' },
  });
  if (!res.ok) throw new Error(`${errorPrefix}: ${res.status}`);
  return res.json();
}

// ── Text Search ──────────────────────────────────────────────────────

export async function textSearch(query: string): Promise<ResolvedPlace> {
  const apiKey = assertApiKey();

  const url = new URL(GOOGLE_MAPS_TEXT_SEARCH_URL);
  url.searchParams.set('query', query);
  url.searchParams.set('language', DEFAULT_LANGUAGE);
  url.searchParams.set('key', apiKey);

  const data = await fetchGoogleApi<GoogleTextSearchResponse>(url, 'Yêu cầu text search thất bại');

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
    photoUrl: createGooglePlacePhotoUrl(photoReference, 640),
  };
}

// ── Directions ───────────────────────────────────────────────────────

export async function fetchDirections(
  from: string,
  to: string,
  mode?: string,
): Promise<DirectionsResult> {
  const apiKey = assertApiKey();

  const fromIsCurrent = isCurrentLocationInput(from);
  const toIsCurrent = isCurrentLocationInput(to);
  let currentLocation: { lng: number; lat: number } | null = null;

  if (fromIsCurrent || toIsCurrent) {
    currentLocation = await getCurrentLocationCoordinates();
  }

  const [resolvedFromPlace, resolvedToPlace] = await Promise.all([
    fromIsCurrent ? Promise.resolve<ResolvedPlace | null>(null) : textSearch(from),
    toIsCurrent ? Promise.resolve<ResolvedPlace | null>(null) : textSearch(to),
  ]);

  const resolvedFrom = fromIsCurrent
    ? `${currentLocation?.lat},${currentLocation?.lng}`
    : `${resolvedFromPlace?.lat},${resolvedFromPlace?.lng}`;
  const resolvedTo = toIsCurrent
    ? `${currentLocation?.lat},${currentLocation?.lng}`
    : `${resolvedToPlace?.lat},${resolvedToPlace?.lng}`;

  const normalizedMode = normalizeDirectionsMode(mode);
  const googleMode = toGoogleDirectionsMode(normalizedMode);

  const url = new URL(GOOGLE_MAPS_DIRECTIONS_URL);
  url.searchParams.set('origin', resolvedFrom);
  url.searchParams.set('destination', resolvedTo);
  url.searchParams.set('mode', googleMode);
  url.searchParams.set('language', DEFAULT_LANGUAGE);
  url.searchParams.set('key', apiKey);

  const data = await fetchGoogleApi<GoogleDirectionsResponse>(
    url,
    'Yêu cầu chỉ đường thất bại',
  );

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
    startAddress:
      fromIsCurrent
        ? 'Vị trí hiện tại của bạn'
        : leg.start_address || resolvedFromPlace?.address || from,
    endAddress:
      toIsCurrent ? 'Vị trí hiện tại của bạn' : leg.end_address || resolvedToPlace?.address || to,
    mode: normalizedMode,
    modeLabel: DIRECTIONS_MODE_LABELS[normalizedMode],
    modeNote:
      normalizedMode === 'motorbike'
        ? 'Google Directions không có mode xe máy riêng, nên hệ thống đang ước tính theo mode lái xe.'
        : null,
  };
}

// ── Nearby Search ────────────────────────────────────────────────────

export async function fetchNearbyPlaces(args: {
  location: { lat: number; lng: number };
  keyword?: string;
  type?: NearbyPlaceType;
  radius?: number;
  minRating?: number;
}): Promise<NearbySearchResult> {
  const apiKey = assertApiKey();

  const keyword = args.keyword?.trim();
  const type = args.type?.trim();
  if (!keyword && !type) {
    throw new Error('Bạn cần cung cấp ít nhất một điều kiện tìm kiếm: keyword hoặc type.');
  }

  const radius = normalizeNearbyRadius(args.radius);
  const minRating = normalizeMinRating(args.minRating);

  const url = new URL(GOOGLE_MAPS_NEARBY_SEARCH_URL);
  url.searchParams.set('location', `${args.location.lat},${args.location.lng}`);
  url.searchParams.set('radius', String(radius));
  url.searchParams.set('language', DEFAULT_LANGUAGE);
  url.searchParams.set('key', apiKey);
  if (keyword) url.searchParams.set('keyword', keyword);
  if (type) url.searchParams.set('type', type);

  const data = await fetchGoogleApi<GoogleNearbySearchResponse>(
    url,
    'Yêu cầu nearby search thất bại',
  );

  if (data.status === 'ZERO_RESULTS') {
    return { radius, minRating, rawCount: 0, filteredOutCount: 0, ratingFilteredOutCount: 0, places: [] };
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

  const placesInRadius = parsedPlaces
    .map((place) => ({
      ...place,
      distanceMeters: haversineDistanceMeters(args.location, { lat: place.lat, lng: place.lng }),
    }))
    .filter((place) => place.distanceMeters <= radius)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const places = placesInRadius
    .filter((place) => (minRating === null ? true : (place.rating ?? -1) >= minRating))
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  return {
    radius,
    minRating,
    rawCount: parsedPlaces.length,
    filteredOutCount: parsedPlaces.length - placesInRadius.length,
    ratingFilteredOutCount: placesInRadius.length - places.length,
    places,
  };
}
