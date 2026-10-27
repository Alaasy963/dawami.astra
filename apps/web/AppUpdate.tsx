import { useEffect, useRef, useState } from "react";
import { t } from "./i18n";
export default function AppUpdate() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [applying, setApplying] = useState(false);
  const requested = useRef(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const inspect = () => {
      if (active && registration?.waiting && navigator.serviceWorker.controller)
        setWaiting(registration.waiting);
    };
    const updateFound = () => {
      installing?.removeEventListener("statechange", inspect);
      installing = registration?.installing ?? null;
      installing?.addEventListener("statechange", inspect);
      inspect();
    };
    const controllerChanged = () => {
      if (requested.current) window.location.reload();
    };
    const check = () => {
      if (navigator.onLine) void registration?.update().catch(() => {});
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      controllerChanged,
    );
    window.addEventListener("online", check);
    window.addEventListener("focus", check);
    void navigator.serviceWorker
      .register("/sw.js")
      .then((r) => {
        if (!active) return;
        registration = r;
        inspect();
        updateFound();
        r.addEventListener("updatefound", updateFound);
      })
      .catch(() => {});
    return () => {
      active = false;
      registration?.removeEventListener("updatefound", updateFound);
      installing?.removeEventListener("statechange", inspect);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        controllerChanged,
      );
      window.removeEventListener("online", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  if (!waiting) return null;
  return (
    <aside className="app-update" role="status">
      <div>
        <strong>{t("تحديث جديد جاهز")}</strong>
        <p>
          {t(
            "احفظ أي نموذج مفتوح قبل التحديث. عمليات الحضور المحفوظة على الجهاز تبقى موجودة.",
          )}
        </p>
      </div>
      <button
        type="button"
        disabled={applying}
        onClick={() => {
          requested.current = true;
          setApplying(true);
          waiting.postMessage({ type: "SKIP_WAITING" });
        }}
      >
        {applying ? t("جارٍ التحديث…") : t("تحديث التطبيق الآن")}
      </button>
    </aside>
  );
}
