import { t } from "./i18n";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
export default function MapView({
  lat,
  lng,
  radius = 0,
  onSelect,
  selected = true,
}: {
  lat: number;
  lng: number;
  radius?: number;
  onSelect?: (point: { lat: number; lng: number }) => void;
  selected?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current).setView([lat, lng], 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    if (selectRef.current)
      map.on("click", (e: L.LeafletMouseEvent) =>
        selectRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }),
      );
    if (selected)
      L.circleMarker([lat, lng], { radius: 8, color: "#2563eb" }).addTo(map);
    if (radius && selected)
      L.circle([lat, lng], {
        radius,
        color: "#2563eb",
        fillOpacity: 0.08,
      }).addTo(map);
    return () => {
      map.remove();
    };
  }, [lat, lng, radius, selected]);
  return (
    <div className="map" ref={ref} aria-label={t("موقع الحضور على الخريطة")} />
  );
}
