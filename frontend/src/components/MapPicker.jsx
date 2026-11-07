import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BOUNDARY, CENTER, insideBeirut } from '../beirut';

/**
 * Map limited to Beirut. Click (or tap) to place the problem's location.
 * Points outside the city boundary are refused: onOutside() is called and nothing is selected.
 *   value: { latitude, longitude } | null
 */
export default function MapPicker({ value, onChange, onOutside, label }) {
  const box = useRef(null);
  const map = useRef(null);
  const pin = useRef(null);
  const cb = useRef({ onChange, onOutside });
  cb.current = { onChange, onOutside };

  useEffect(() => {
    const bounds = L.latLngBounds(BOUNDARY).pad(0.15);
    const m = L.map(box.current, {
      center: CENTER, zoom: 13, minZoom: 12, maxZoom: 18, maxBounds: bounds, maxBoundsViscosity: 1, scrollWheelZoom: false,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    // grey out everything outside Beirut, outline the city
    L.polygon([[[34.2, 35.1], [34.2, 36.0], [33.6, 36.0], [33.6, 35.1]], BOUNDARY], {
      stroke: false, fillColor: '#1d2b24', fillOpacity: 0.35, interactive: false,
    }).addTo(m);
    L.polygon(BOUNDARY, { color: '#C61F1E', weight: 2, fill: false, interactive: false }).addTo(m);
    m.fitBounds(L.latLngBounds(BOUNDARY));

    m.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (!insideBeirut(lat, lng)) { cb.current.onOutside?.(); return; }
      cb.current.onChange({ latitude: lat.toFixed(6), longitude: lng.toFixed(6) });
    });
    map.current = m;
    return () => { m.remove(); map.current = null; pin.current = null; };
  }, []);

  // show the selected point
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (pin.current) { pin.current.remove(); pin.current = null; }
    if (value) {
      const ll = [Number(value.latitude), Number(value.longitude)];
      pin.current = L.circleMarker(ll, { radius: 9, color: '#fff', weight: 3, fillColor: '#c0392b', fillOpacity: 1 }).addTo(m);
      if (!m.getBounds().contains(ll)) m.setView(ll, 16);
    }
  }, [value]);

  return <div ref={box} className="map-picker" dir="ltr" role="application" aria-label={label} />;
}
