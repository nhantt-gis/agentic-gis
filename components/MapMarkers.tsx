/**
 * MapMarkers — Declarative React layer for all map markers & popups.
 *
 * Renders inside react-map-gl's <Map> component.
 * Reads data from the marker store (written by tool executions).
 */

'use client';

import React from 'react';
import { Marker, Popup } from 'react-map-gl/maplibre';
import { useMapMarkers, markerActions } from '@/lib/map/marker-store';
import type { PopupPlaceData, BoundaryPlaceData } from '@/lib/map/marker-store';
import { GENERIC_PLACE_TYPES } from '@/lib/map/constants';

// ── Helpers ──────────────────────────────────────────────────────────

const PLACE_TYPE_LABEL_OVERRIDES: Record<string, string> = {
  traffic_camera: 'Camera giao thông',
};

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatPrimaryPlaceType(types: string[]): string {
  const preferred = types.find((t) => !GENERIC_PLACE_TYPES.has(t));
  if (!preferred) return 'Địa điểm';
  return PLACE_TYPE_LABEL_OVERRIDES[preferred] || toTitleCase(preferred.replace(/_/g, ' '));
}

// ── Rating Stars ─────────────────────────────────────────────────────

function RatingStars({ rating }: { rating: number }) {
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span>
      <span style={{ color: '#F59E0B' }}>{'★'.repeat(rounded)}</span>
      <span style={{ color: '#D1D5DB' }}>{'★'.repeat(5 - rounded)}</span>
    </span>
  );
}

// ── Popup Content: Place ─────────────────────────────────────────────

function PlacePopupContent({ place }: { place: PopupPlaceData }) {
  const typeLabel = formatPrimaryPlaceType(place.types);

  return (
    <div style={{ background: '#FFFFFF' }}>
      {/* Image or placeholder */}
      {place.photoUrl ? (
        <img
          src={place.photoUrl}
          alt={place.name}
          style={{ display: 'block', width: '100%', height: 132, objectFit: 'cover' }}
          loading="lazy"
        />
      ) : (
        <div
          style={{
            height: 132,
            background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 45%, #93c5fd 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#2563EB',
            fontSize: 34,
          }}
        >
          📍
        </div>
      )}

      {/* Details */}
      <div style={{ padding: '12px 14px 14px' }}>
        <div
          style={{
            fontSize: 20,
            lineHeight: 1.25,
            fontWeight: 600,
            color: '#111827',
            wordBreak: 'break-word',
          }}
        >
          {place.name}
        </div>

        {typeof place.rating === 'number' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <RatingStars rating={place.rating} />
            <span style={{ fontSize: 12, color: '#4B5563', fontWeight: 600 }}>
              {place.rating.toFixed(1)}
            </span>
            {typeof place.userRatingsTotal === 'number' && (
              <span style={{ fontSize: 12, color: '#6B7280' }}>({place.userRatingsTotal})</span>
            )}
          </div>
        )}

        <div style={{ marginTop: 4, fontSize: 13, color: '#4B5563' }}>{typeLabel}</div>

        {place.openNow === true && (
          <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: '#10B981' }}>
            Đang mở cửa
          </div>
        )}
        {place.openNow === false && (
          <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: '#EF4444' }}>
            Hiện đang đóng cửa
          </div>
        )}

        <div style={{ marginTop: 4, fontSize: 12, color: '#6B7280' }}>{place.address}</div>

        {typeof place.distanceMeters === 'number' && (
          <div style={{ marginTop: 2, fontSize: 12, color: '#6B7280' }}>
            Cách {(place.distanceMeters / 1000).toFixed(2)} km
          </div>
        )}
      </div>
    </div>
  );
}

// ── Popup Content: Boundary ──────────────────────────────────────────

function BoundaryPopupContent({ place }: { place: BoundaryPlaceData }) {
  return (
    <div style={{ background: '#FFFFFF' }}>
      <div
        style={{
          height: 80,
          background: 'linear-gradient(135deg, #4338CA 0%, #6366F1 45%, #818CF8 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontSize: 34,
        }}
      >
        🏛️
      </div>
      <div style={{ padding: '12px 14px 14px' }}>
        <div
          style={{
            fontSize: 18,
            lineHeight: 1.25,
            fontWeight: 600,
            color: '#111827',
            wordBreak: 'break-word',
          }}
        >
          {place.name}
        </div>
        <div style={{ marginTop: 4, fontSize: 13, color: '#6B7280' }}>{place.nameEn}</div>
        <div
          style={{
            marginTop: 6,
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 9999,
            background: '#EEF2FF',
            color: '#4338CA',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {place.level}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: '#9CA3AF' }}>
          Tọa độ: {place.center.lat.toFixed(4)}, {place.center.lng.toFixed(4)}
        </div>
      </div>
    </div>
  );
}

// ── Custom Nearby Marker Icon ────────────────────────────────────────

function NearbyMarkerIcon({
  photoUrl,
  name,
  index,
}: {
  photoUrl: string | null;
  name: string;
  index: number;
}) {
  return (
    <div
      className="gtel-nearby-marker"
      aria-label={`Địa điểm lân cận ${index + 1}: ${name}`}
      style={
        photoUrl
          ? {
              backgroundImage: `linear-gradient(145deg, rgba(37, 99, 235, 0.2), rgba(37, 99, 235, 0.55)), url("${photoUrl}")`,
            }
          : {
              backgroundImage: 'linear-gradient(145deg, #f59e0b, #f97316)',
            }
      }
    >
      {!photoUrl && <span style={{ fontSize: 14, lineHeight: 1 }}>📍</span>}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export default function MapMarkers() {
  const markers = useMapMarkers();

  const handleMarkerClick = (popupId: string) => {
    markerActions.openPopup(popupId);
  };

  return (
    <>
      {/* ── Search Place Marker ──────────────────────────────────── */}
      {markers.searchPlace && (
        <>
          <Marker
            longitude={markers.searchPlace.lngLat[0]}
            latitude={markers.searchPlace.lngLat[1]}
            color={markers.searchPlace.color}
            onClick={(event) => {
              event.originalEvent.stopPropagation();
              handleMarkerClick('search');
            }}
          />
          {markers.openPopupId === 'search' && (
            <Popup
              longitude={markers.searchPlace.lngLat[0]}
              latitude={markers.searchPlace.lngLat[1]}
              offset={22}
              className="gtel-google-popup"
              closeButton={false}
              closeOnClick={false}
              onClose={markerActions.closePopup}
            >
              <PlacePopupContent place={markers.searchPlace.popupData} />
            </Popup>
          )}
        </>
      )}

      {/* ── Boundary Marker ──────────────────────────────────────── */}
      {markers.boundary && (
        <>
          <Marker
            longitude={markers.boundary.lngLat[0]}
            latitude={markers.boundary.lngLat[1]}
            color={markers.boundary.color}
            onClick={(event) => {
              event.originalEvent.stopPropagation();
              handleMarkerClick('boundary');
            }}
          />
          {markers.openPopupId === 'boundary' && (
            <Popup
              longitude={markers.boundary.lngLat[0]}
              latitude={markers.boundary.lngLat[1]}
              offset={22}
              className="gtel-google-popup"
              closeButton={false}
              closeOnClick={false}
              onClose={markerActions.closePopup}
            >
              <BoundaryPopupContent place={markers.boundary.popupData} />
            </Popup>
          )}
        </>
      )}

      {/* ── Direction Start Marker ───────────────────────────────── */}
      {markers.directionsStart && (
        <>
          <Marker
            longitude={markers.directionsStart.lngLat[0]}
            latitude={markers.directionsStart.lngLat[1]}
            color={markers.directionsStart.color}
            onClick={(event) => {
              event.originalEvent.stopPropagation();
              handleMarkerClick('dir-start');
            }}
          />
          {markers.openPopupId === 'dir-start' && (
            <Popup
              longitude={markers.directionsStart.lngLat[0]}
              latitude={markers.directionsStart.lngLat[1]}
              offset={22}
              closeButton={false}
              closeOnClick={false}
              onClose={markerActions.closePopup}
            >
              <div>
                <strong>{markers.directionsStart.label}</strong>
                <br />
                {markers.directionsStart.address}
              </div>
            </Popup>
          )}
        </>
      )}

      {/* ── Direction End Marker ─────────────────────────────────── */}
      {markers.directionsEnd && (
        <>
          <Marker
            longitude={markers.directionsEnd.lngLat[0]}
            latitude={markers.directionsEnd.lngLat[1]}
            color={markers.directionsEnd.color}
            onClick={(event) => {
              event.originalEvent.stopPropagation();
              handleMarkerClick('dir-end');
            }}
          />
          {markers.openPopupId === 'dir-end' && (
            <Popup
              longitude={markers.directionsEnd.lngLat[0]}
              latitude={markers.directionsEnd.lngLat[1]}
              offset={22}
              closeButton={false}
              closeOnClick={false}
              onClose={markerActions.closePopup}
            >
              <div>
                <strong>{markers.directionsEnd.label}</strong>
                <br />
                {markers.directionsEnd.address}
              </div>
            </Popup>
          )}
        </>
      )}

      {/* ── Nearby Place Markers ─────────────────────────────────── */}
      {markers.nearbyPlaces.map((place, index) => {
        const popupId = `nearby-${index}`;
        return (
          <React.Fragment key={index}>
            <Marker
              longitude={place.lngLat[0]}
              latitude={place.lngLat[1]}
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                handleMarkerClick(popupId);
              }}
            >
              <NearbyMarkerIcon photoUrl={place.photoUrl} name={place.name} index={index} />
            </Marker>
            {markers.openPopupId === popupId && (
              <Popup
                longitude={place.lngLat[0]}
                latitude={place.lngLat[1]}
                offset={22}
                className="gtel-google-popup"
                closeButton={false}
                closeOnClick={false}
                onClose={markerActions.closePopup}
              >
                <PlacePopupContent place={place.popupData} />
              </Popup>
            )}
          </React.Fragment>
        );
      })}

      {/* ── User Location Marker ─────────────────────────────────── */}
      {markers.userLocation && (
        <>
          <Marker
            longitude={markers.userLocation.lngLat[0]}
            latitude={markers.userLocation.lngLat[1]}
            color="#10B981"
            onClick={(event) => {
              event.originalEvent.stopPropagation();
              handleMarkerClick('user');
            }}
          />
          {markers.openPopupId === 'user' && (
            <Popup
              longitude={markers.userLocation.lngLat[0]}
              latitude={markers.userLocation.lngLat[1]}
              offset={22}
              closeButton={false}
              closeOnClick={false}
              onClose={markerActions.closePopup}
            >
              <strong>📍 Vị trí của bạn</strong>
            </Popup>
          )}
        </>
      )}
    </>
  );
}
