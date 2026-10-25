import { t } from "./i18n";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
export default function MapView({
  lat,
  lng,
  radius = 0,
}: {
  lat: number;
  lng: number;
  radius?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current).setView([lat, lng], 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    L.circleMarker([lat, lng], { radius: 8, color: "#2563eb" }).addTo(map);
    if (radius)
      L.circle([lat, lng], {
        radius,
        color: "#2563eb",
        fillOpacity: 0.08,
      }).addTo(map);
    return () => {
      map.remove();
    };
  }, [lat, lng, radius]);
  return (
    <div className="map" ref={ref} aria-label={t("موقع الحضور على الخريطة")} />
  );
}
