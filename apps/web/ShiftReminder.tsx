import { useEffect, useRef, useState } from "react";
import { api } from "./lib";
import { t } from "./i18n";
export default function ShiftReminder({ revision }: { revision: number }) {
  const [reminder, setReminder] = useState<any>(null),
    [enabled, setEnabled] = useState(false),
    [alert, setAlert] = useState(false),
    [error, setError] = useState("");
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => {
    let live = true;
    api("/attendance/shift-reminder")
      .then((r) => {
        if (live) setReminder(r.reminder);
      })
      .catch(() => {
        if (live) setReminder(null);
      });
    return () => {
      live = false;
    };
  }, [revision]);
  useEffect(() => {
    setAlert(false);
    setEnabled(false);
    setError("");
  }, [reminder?.sessionId]);
  useEffect(() => {
    if (!enabled || !reminder) return;
    let watch: number | null = null,
      outsideSince: number | null = null,
      notified = false,
      lastFix = 0;
    const stop = () => {
      if (watch !== null) navigator.geolocation.clearWatch(watch);
      watch = null;
      outsideSince = null;
      lastFix = 0;
    };
    const tick = () => {
      if (document.visibilityState !== "visible") {
        stop();
        return;
      }
      if (Date.now() < reminder.endAt) return;
      if (watch === null)
        watch = navigator.geolocation.watchPosition(
          (p) => {
            lastFix = Date.now();
            const { latitude, longitude, accuracy } = p.coords;
            if (accuracy > reminder.accuracy) {
              outsideSince = null;
              return;
            }
            const rad = (x: number) => (x * Math.PI) / 180,
              dlat = rad(latitude - reminder.lat),
              dlng = rad(longitude - reminder.lng);
            const hav =
              Math.sin(dlat / 2) ** 2 +
              Math.cos(rad(latitude)) *
                Math.cos(rad(reminder.lat)) *
                Math.sin(dlng / 2) ** 2;
            const metres =
              6371000 *
              2 *
              Math.atan2(Math.sqrt(hav), Math.sqrt(Math.max(0, 1 - hav)));
            if (metres > reminder.radius + accuracy)
              outsideSince ??= Date.now();
            else outsideSince = null;
          },
          () => {
            outsideSince = null;
            lastFix = 0;
            setError(
              t(
                "تعذّر التحقق من الموقع للتذكير؛ سجّل الخروج عند انتهاء دوامك.",
              ),
            );
          },
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
        );
      if (lastFix && Date.now() - lastFix > 30000) outsideSince = null;
      if (
        !notified &&
        outsideSince !== null &&
        Date.now() - outsideSince >= reminder.graceMs
      ) {
        notified = true;
        setAlert(true);
        navigator.vibrate?.([200, 100, 200]);
        try {
          const ctx = audio.current;
          if (ctx && ctx.state === "running") {
            const oscillator = ctx.createOscillator(),
              gain = ctx.createGain();
            oscillator.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.value = 0.08;
            oscillator.frequency.value = 660;
            oscillator.start();
            oscillator.stop(ctx.currentTime + 0.4);
          }
        } catch {}
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      stop();
    };
  }, [enabled, reminder]);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  if (!reminder) return null;
  return (
    <section className="card padded">
      <strong>{t("تذكير تسجيل الخروج")}</strong>
      <p>
        {t(
          "يمكن تفعيل تنبيه مغادرة الفرع بعد نهاية الشفت. الموقع يُفحص محلياً والصفحة ظاهرة فقط، ولا يُرسل للخادم.",
        )}
      </p>
      <button
        className="ghost"
        onClick={() => {
          if (!enabled) {
            try {
              audio.current ??= new AudioContext();
              void audio.current.resume();
            } catch {}
            if (!navigator.geolocation) {
              setError(t("الموقع غير متاح بهذا المتصفح"));
              return;
            }
          }
          setEnabled(!enabled);
          setError("");
        }}
      >
        {t(enabled ? "إيقاف تذكير الموقع" : "تفعيل تذكير الموقع")}
      </button>
      {error && <p role="status">{error}</p>}
      {alert && enabled && (
        <p role="alert">
          {t("انتهى شفتك وأنت خارج الفرع؛ تذكّر تسجيل الخروج.")}
        </p>
      )}
    </section>
  );
}
