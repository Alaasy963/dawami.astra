import { useEffect, useState } from "react";
import { api } from "./lib";
import { t } from "./i18n";
export default function PushControls() {
  const [ready, setReady] = useState<{
    registration: ServiceWorkerRegistration;
    key: Uint8Array<ArrayBuffer>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setMessage(
        t("هالمتصفح لا يدعم الإشعارات. على iPhone أضف التطبيق للشاشة الرئيسية"),
      );
      return;
    }
    void Promise.all([api("/public/config"), navigator.serviceWorker.ready])
      .then(([config, registration]) => {
        if (!config.vapidPublicKey)
          throw new Error(t("مفاتيح push لم تُجهز على الخادم بعد"));
        const raw = atob(
          config.vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/"),
        );
        if (alive)
          setReady({
            registration,
            key: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
          });
      })
      .catch((error) => {
        if (alive) setMessage(error.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  const enable = () => {
    if (!ready || busy) return;
    setBusy(true);
    setMessage("");
    // Call subscribe synchronously from the click, before any awaited network work.
    void ready.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: ready.key })
      .then((subscription) => api("/push/subscribe", subscription.toJSON()))
      .then(() => setMessage(t("تم تفعيل الإشعارات")))
      .catch((error) =>
        setMessage(
          typeof Notification !== "undefined" &&
            Notification.permission === "denied"
            ? t("الإشعارات محظورة. فعّلها من إعدادات الجهاز ثم أعد المحاولة.")
            : error.message,
        ),
      )
      .finally(() => setBusy(false));
  };
  const test = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const subscription =
        await ready.registration.pushManager.getSubscription();
      if (!subscription) throw new Error(t("فعّل إشعارات الجهاز أولاً."));
      await api("/push/subscribe", subscription.toJSON());
      await api("/push/test", {});
      setMessage(
        t(
          "تمت جدولة إشعار تجريبي لحسابك. انتظر نحو دقيقة وتحقق من مركز إشعارات الجهاز.",
        ),
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <p>
        {t(
          "على iPhone: أضف دوامي للشاشة الرئيسية وافتحه من الأيقونة، ثم فعّل الإشعارات.",
        )}
      </p>
      <div className="actions">
        <button type="button" disabled={!ready || busy} onClick={enable}>
          {t("تفعيل إشعارات الجهاز")}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!ready || busy}
          onClick={() => void test()}
        >
          {t("إرسال إشعار تجريبي")}
        </button>
      </div>
      <p role="status">{message}</p>
    </div>
  );
}
