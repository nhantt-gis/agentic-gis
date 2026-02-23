/**
 * HTML rendering helpers for map popups and markers.
 * Pure functions — no map or state dependencies.
 */

import { GENERIC_PLACE_TYPES } from './constants';

// ── String Helpers ───────────────────────────────────────────────────

export function escapeHtml(value: string): string {
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
  return preferredType ? toTitleCase(preferredType.replace(/_/g, ' ')) : 'Địa điểm';
}

function getRatingStarsHtml(rating: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  const filled = '★'.repeat(rounded);
  const empty = '★'.repeat(5 - rounded);
  return `<span style="color:#F59E0B;">${filled}</span><span style="color:#D1D5DB;">${empty}</span>`;
}

// ── Popup HTML ───────────────────────────────────────────────────────

export interface PopupPlaceData {
  name: string;
  address: string;
  rating: number | null;
  userRatingsTotal: number | null;
  distanceMeters: number | null;
  types: string[];
  openNow: boolean | null;
  photoUrl: string | null;
}

export function buildPopupHtml(place: PopupPlaceData): string {
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

  return `<div style="background:#FFFFFF;">
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

// ── Marker Element ───────────────────────────────────────────────────

export function createNearbyMarkerElement(
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
