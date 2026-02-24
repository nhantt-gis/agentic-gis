/**
 * GTEL Maps API interaction layer.
 * Handles administrative boundary (RGHC) data: province list and boundary geometry.
 */

import { GTEL_ADMIN_PROVINCES_URL, GTEL_MAPS_API_KEY } from './constants';
import { mapState } from './state';

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

// ── Helpers ──────────────────────────────────────────────────────────

function assertApiKey(): string {
  if (!GTEL_MAPS_API_KEY) {
    throw new Error(
      'Thiếu NEXT_PUBLIC_GTEL_MAPS_API_KEY. Vui lòng cấu hình trong file .env.local.',
    );
  }
  return GTEL_MAPS_API_KEY;
}

async function fetchGtelApi<T>(url: URL, errorPrefix: string): Promise<T> {
  const res = await fetch(url.toString(), {
    headers: { 'app-version': '1.1' },
  });
  if (!res.ok) throw new Error(`${errorPrefix}: ${res.status}`);
  return res.json();
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

  mapState.provinces = data.data;
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
  
  const data = await fetchGtelApi<ProvinceBoundaryResponse>(url, 'Yêu cầu ranh giới hành chính thất bại');

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
  }

  return null;
}
