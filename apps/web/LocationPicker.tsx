import { lazy, Suspense, useRef, useState } from "react";
import { searchPlaces } from "./places";
import { t } from "./i18n";
const Map = lazy(() => import("./Map"));
export type Point = { lat: number; lng: number };
export default function LocationPicker({
  value,
  onChange,
  radius,
}: {
  value: Point | null;
  onChange: (point: Point | null) => void;
  radius: number;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(Point & { label: string })[]>([]);
  const [candidate, setCandidate] = useState<Point | null>(null);
  const [center, setCenter] = useState<Point>(
    value ?? { lat: 33.5138, lng: 36.2765 },
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const select = (point: Point) => {
    generation.current++;
    setBusy(false);
    setCandidate(null);
    setCenter(point);
    onChange(point);
    setMessage("");
  };
  const search = async () => {
    const request = ++generation.current;
    setBusy(true);
    setMessage("");
    setResults([]);
    try {
      const data = await searchPlaces(query.trim());
      if (request !== generation.current) return;
      setResults(data.items);
      if (!data.items.length)
        setMessage(
          t(
            "ما لقينا نتائج. جرّب اسم الشارع مع المدينة والبلد، أو حدد المكان على الخريطة.",
          ),
        );
    } catch (e) {
      if (request === generation.current) setMessage((e as Error).message);
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  const locate = () => {
    const request = ++generation.current;
    setMessage("");
    setBusy(true);
    if (!navigator.geolocation) {
      setBusy(false);
      setMessage(t("المتصفح لا يدعم تحديد الموقع. استخدم البحث أو الخريطة."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (request !== generation.current) return;
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        onChange(null);
        setCandidate(point);
        setCenter(point);
        setBusy(false);
      },
      (error) => {
        if (request !== generation.current) return;
        setBusy(false);
        setMessage(
          error.code === 1
            ? t(
                "إذن الموقع محظور. اسمح به من إعدادات المتصفح، أو استخدم البحث والخريطة.",
              )
            : t(
                "تعذّر تحديد موقعك حالياً. جرّب مجدداً أو استخدم البحث والخريطة.",
              ),
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };
  return (
    <fieldset className="location-picker">
      <legend>{t("موقع الفرع")}</legend>
      <label className="field">
        <span>{t("ابحث باسم الشارع والمدينة والبلد")}</span>
        <input
          value={query}
          maxLength={200}
          onChange={(e) => {
            generation.current++;
            setBusy(false);
            setResults([]);
            setQuery(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (query.trim().length >= 3 && !busy) void search();
            }
          }}
        />
      </label>
      <div className="actions">
        <button
          type="button"
          disabled={busy || query.trim().length < 3}
          onClick={() => void search()}
        >
          {t("بحث عن العنوان")}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={locate}
        >
          {t("تحديد موقع الفرع من موقعي")}
        </button>
      </div>
      {busy && <p role="status">{t("عم نحدد الموقع…")}</p>}
      <p role="status">{message}</p>
      {results.map((place, i) => (
        <button
          type="button"
          className="choice"
          key={i}
          onClick={() => select(place)}
        >
          {place.label}
        </button>
      ))}
      <p>{t("اضغط على الخريطة لتحديد مكان الفرع أو تعديل النقطة.")}</p>
      <Suspense fallback={<p>{t("عم نحمّل الخريطة…")}</p>}>
        <Map
          lat={center.lat}
          lng={center.lng}
          radius={radius}
          selected={!!value || !!candidate}
          onSelect={select}
        />
      </Suspense>
      {candidate && (
        <div role="group" aria-label={t("تأكيد موقع الفرع")}>
          <p>{t("هل النقطة الظاهرة هي مكان الفرع الصحيح؟")}</p>
          <div className="actions">
            <button type="button" onClick={() => select(candidate)}>
              {t("نعم، اعتمد هذا المكان")}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setCandidate(null);
                onChange(null);
                setMessage(
                  t("حدد المكان بالضغط على الخريطة أو بالبحث عن العنوان."),
                );
              }}
            >
              {t("لا، سأحدد مكاناً آخر")}
            </button>
          </div>
        </div>
      )}
      <p role="status">
        {value
          ? t("تم اختيار الموقع. اضغط حفظ الفرع لاعتماده.")
          : t("اختر موقعاً للفرع قبل الحفظ.")}
      </p>
      <small>© OpenStreetMap · Photon</small>
    </fieldset>
  );
}
