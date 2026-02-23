/**
 * Pure geographic calculations and utility functions.
 * No side effects — these are stateless helpers.
 */

import type { DirectionsMode } from '@/types';
import {
  EARTH_RADIUS_M,
  BUFFER_SEGMENTS,
  CURRENT_LOCATION_PATTERNS,
  DEFAULT_DIRECTIONS_MODE,
  DEFAULT_NEARBY_RADIUS,
  MIN_NEARBY_RADIUS,
  MAX_NEARBY_RADIUS,
} from './constants';

// ── Angle Conversions ────────────────────────────────────────────────

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

// ── Haversine Distance ───────────────────────────────────────────────

export function haversineDistanceMeters(
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

// ── Buffer Geometry ──────────────────────────────────────────────────

export function buildBufferCoordinates(
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

// ── Polyline Decoder ─────────────────────────────────────────────────

export function decodeGooglePolyline(encoded: string): Array<[number, number]> {
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

// ── Location Text Helpers ────────────────────────────────────────────

export function normalizeLocationText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function isCurrentLocationInput(value: string): boolean {
  const normalized = normalizeLocationText(value);
  return CURRENT_LOCATION_PATTERNS.some((pattern) => normalized.includes(pattern));
}

export async function getCurrentLocationCoordinates(): Promise<{ lng: number; lat: number }> {
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

// ── Normalization Helpers ────────────────────────────────────────────

export function normalizeNearbyRadius(radius?: number): number {
  if (typeof radius !== 'number' || !Number.isFinite(radius)) {
    return DEFAULT_NEARBY_RADIUS;
  }
  return Math.min(MAX_NEARBY_RADIUS, Math.max(MIN_NEARBY_RADIUS, Math.round(radius)));
}

export function normalizeMinRating(minRating?: number): number | null {
  if (typeof minRating !== 'number' || !Number.isFinite(minRating)) {
    return null;
  }
  const bounded = Math.min(5, Math.max(0, minRating));
  return Math.round(bounded * 10) / 10;
}

export function normalizeDirectionsMode(mode?: string): DirectionsMode {
  if (!mode) return DEFAULT_DIRECTIONS_MODE;

  const normalized = mode.trim().toLowerCase();
  const validModes: DirectionsMode[] = ['driving', 'walking', 'bicycling', 'transit', 'motorbike'];
  return (validModes.find((m) => m === normalized) as DirectionsMode) ?? DEFAULT_DIRECTIONS_MODE;
}

/** Google Directions API has no dedicated "motorbike" mode — fall back to driving. */
export function toGoogleDirectionsMode(
  mode: DirectionsMode,
): 'driving' | 'walking' | 'bicycling' | 'transit' {
  return mode === 'motorbike' ? 'driving' : mode;
}
