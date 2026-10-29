import { t, language, locale } from "./i18n";
import {
  StrictMode,
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Users,
  MapPin,
  Building2,
  Bell,
  Settings,
  LogOut,
  Check,
  Clock3,
  ArrowUpLeft,
  ShieldCheck,
  RefreshCw,
  ChevronLeft,
  WifiOff,
  Sun,
  Moon,
} from "lucide-react";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import {
  api,
  ApiError,
  setCsrf,
  signOut,
  deviceId,
  localDB,
  syncQueue,
  currencies,
  uploadLogo,
  type Operation,
} from "./lib";
import "./style.css";
import AppUpdate from "./AppUpdate";
import { viewContext } from "./view-context";
import { notificationLocation } from "./notification-location";
import PushControls from "./PushControls";
import { attendanceView, elapsedTime } from "./attendance-view";
import {
  saveOfflineProfile,
  readOfflineProfile,
  clearOfflineProfile,
} from "./offline-profile";
import { getCurrentLocation } from "./geolocation";
import LocationPicker, { type Point } from "./LocationPicker";

document.documentElement.lang = language;
document.documentElement.dir = language === "en" ? "ltr" : "rtl";
const MapView = lazy(() => import("./Map"));
const LiteContext = createContext(false);
function OptionalMap(props: { lat: number; lng: number; radius?: number }) {
  const lite = useContext(LiteContext),
    [show, setShow] = useState(false);
  if (lite && !show)
    return (
      <button className="ghost" onClick={() => setShow(true)}>
        {t("تحميل الخريطة عند الطلب")}
      </button>
    );
  return <MapView {...props} />;
}
const roles: Record<string, string> = {
  gm: t("مدير عام"),
  am: t("مدير مساعد"),
  manager: t("مدير فرع / قسم"),
  worker: t("عامل"),
};
const time = (v: number) =>
  v
    ? new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(v)
    : "—";
type Action = (fn: () => Promise<any>, success?: string) => Promise<void>;
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({ text = t("ما في سجلات لسا.") }: { text?: string }) {
  return (
    <div className="empty">
      <Clock3 size={30} />
      <p>{text}</p>
    </div>
  );
}
function LanguageSwitch() {
  return (
    <button
      type="button"
      className="ghost"
      aria-label={language === "en" ? "Switch to Arabic" : "Switch to English"}
      onClick={() => {
        localStorage.setItem("language", language === "en" ? "ar" : "en");
        window.location.reload();
      }}
    >
      {language === "en" ? "العربية" : "English"}
    </button>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span>
        <Check strokeWidth={3} size={27} />
      </span>
      <b>{t("دوامي")}</b>
      <small>dawami.v2</small>
    </div>
  );
}
function useData(path: string, revision = 0, enabled = true) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    if (!enabled) return;
    api(path)
      .then((x) => alive && setData(x))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [path, revision, enabled]);
  return {
    data,
    error,
  };
}
function CurrencySelect({ value = "SYP" }: { value?: string }) {
  return (
    <select name="currency" defaultValue={value}>
      {currencies.map((x) => (
        <option key={x} value={x}>
          {x} —{" "}
          {new Intl.DisplayNames([language], {
            type: "currency",
          }).of(x)}
        </option>
      ))}
    </select>
  );
}
function Auth({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [signup, setSignup] = useState(false),
    [error, setError] = useState(""),
    [fieldErrors, setFieldErrors] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [local, setLocal] = useState(false);
  return (
    <div className="auth">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="pill">{t("وقت أقل بالإدارة، وقت أكثر للشغل")}</span>
          <h1>
            {t("يوم شغل واضح.")}
            <br />
            {t("وفريق على نفس الصفحة.")}
          </h1>
          <p>
            {t("الحضور، الفريق، والفروع — بمكان واحد،")}
            <br />
            {t("مصمّم ليكون بسيط من أول يوم.")}
          </p>
          <div className="story-card">
            <Check />
            <div>
              <strong>{t("كل حضور إلو مكان ووقت")}</strong>
              <p>{t("تسجيل آمن ضمن نطاق الفرع")}</p>
            </div>
            <ShieldCheck />
          </div>
        </div>
        <small>{t("دوامي · نظام الحضور وإدارة الفريق")}</small>
      </section>
      <section className="auth-card">
        <LanguageSwitch />
        <div className="eyebrow">{t("أهلاً فيك بدوامي")}</div>
        <h2>{signup ? t("خلّينا نرتّب يوم شركتك") : t("منوّر من جديد")}</h2>
        <p>
          {signup
            ? t("أنشئ شركتك وابدأ التجربة المجانية.")
            : t("سجّل دخول وتابع يومك.")}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setFieldErrors({});
            const f = new FormData(e.currentTarget);
            try {
              await api(signup ? "/auth/signup" : "/auth/login", {
                phone: f.get("phone"),
                pin: f.get("pin"),
                device: deviceId(),
                ...(signup
                  ? {
                      name: f.get("name"),
                      company: f.get("company"),
                      currency: f.get("currency"),
                    }
                  : local
                    ? {
                        companyId: f.get("companyId"),
                      }
                    : {}),
              });
              await onSuccess();
            } catch (e) {
              setError((e as Error).message);
              if (e instanceof ApiError) setFieldErrors(e.fieldErrors);
            } finally {
              setBusy(false);
            }
          }}
        >
          {signup && (
            <>
              <Field label={t("اسم الشركة")}>
                <input
                  name="company"
                  required
                  minLength={2}
                  maxLength={100}
                  aria-invalid={!!fieldErrors.company}
                  aria-describedby="auth-company-error"
                />
                <small id="auth-company-error" className="error">
                  {fieldErrors.company}
                </small>
              </Field>
              <Field label={t("اسمك الكامل")}>
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                  aria-invalid={!!fieldErrors.name}
                  aria-describedby="auth-name-error"
                />
                <small id="auth-name-error" className="error">
                  {fieldErrors.name}
                </small>
              </Field>
              <Field label={t("عملة الشركة")}>
                <CurrencySelect />
              </Field>
            </>
          )}
          <Field label={t("رقم الموبايل مع رمز البلد")}>
            <input
              name="phone"
              type="tel"
              dir="ltr"
              placeholder="+9639xxxxxxxx"
              aria-invalid={!!fieldErrors.phone}
              aria-describedby="auth-phone-hint auth-phone-error"
              required
              autoComplete="tel"
            />
            <small id="auth-phone-hint">
              {t(
                "اكتب رقم الموبايل مع + ورمز البلد، بدون مسافات أو صفر البداية المحلي.",
              )}
            </small>
            <small id="auth-phone-error" className="error">
              {fieldErrors.phone}
            </small>
          </Field>
          <Field label={t("كلمة السر / PIN")}>
            <input
              name="pin"
              type="password"
              minLength={signup ? 8 : 1}
              maxLength={128}
              aria-invalid={!!fieldErrors.pin}
              aria-describedby="auth-pin-hint auth-pin-error"
              required
              autoComplete={signup ? "new-password" : "current-password"}
            />
            <small id="auth-pin-hint">
              {signup && t("كلمة السر لازم تكون بين 8 و128 حرف.")}
            </small>
            <small id="auth-pin-error" className="error">
              {fieldErrors.pin}
            </small>
          </Field>
          {local && !signup && (
            <Field label={t("رمز الشركة من المدير")}>
              <input
                name="companyId"
                dir="ltr"
                required
                aria-invalid={!!fieldErrors.companyId}
                aria-describedby="auth-company-id-error"
              />
              <small id="auth-company-id-error" className="error">
                {fieldErrors.companyId &&
                  t("رمز الشركة غير صالح. انسخه كامل من مديرك.")}
              </small>
            </Field>
          )}
          <div role="alert" className="error">
            {error}
          </div>
          <button disabled={busy} className="wide">
            {busy
              ? t("عم نتحقق…")
              : signup
                ? t("إنشاء الشركة")
                : t("تسجيل الدخول")}
            <ArrowUpLeft size={19} />
          </button>
        </form>
        {!signup && (
          <button className="text-button" onClick={() => setLocal(!local)}>
            {local ? t("الدخول بالهوية العامة") : t("عندي PIN مؤقت من المدير")}
          </button>
        )}
        <div className="auth-switch">
          {signup ? t("عندك حساب؟") : t("أول مرة هون؟")}{" "}
          <button
            onClick={() => {
              setSignup(!signup);
              setError("");
              setFieldErrors({});
            }}
          >
            {signup ? t("سجّل دخول") : t("أنشئ شركتك")}
          </button>
        </div>
        <p className="fine-print">
          {t("نسيت PIN؟ مديرك المسؤول بيساعدك باستعادته.")}
          <br />
          {t("ما في دفع داخل التطبيق.")}
        </p>
      </section>
    </div>
  );
}
function App() {
  const hadSession = useRef(false);
  const [me, setMe] = useState<any>(null),
    [ready, setReady] = useState(false),
    [view, setView] = useState(
      ["location", "notifications"].includes(
        new URLSearchParams(location.search).get("view") ?? "",
      )
        ? "notifications"
        : new URLSearchParams(location.search).get("view") === "attendance"
          ? "attendance"
          : "dashboard",
    ),
    [revision, setRevision] = useState(0),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [dark, setDark] = useState(localStorage.getItem("theme") === "dark"),
    [lite, setLite] = useState(localStorage.getItem("lite") === "true");
  useEffect(() => {
    document.documentElement.toggleAttribute("data-lite", lite);
    localStorage.setItem("lite", String(lite));
  }, [lite]);
  const refresh = useCallback(async () => {
    try {
      const x = await api("/auth/me");
      setCsrf(x.csrf);
      setMe(x);
      hadSession.current = true;
      setOnline(true);
      try {
        saveOfflineProfile(x, deviceId());
      } catch {
        /* Storage can be unavailable in private browsing. */
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if ([401, 403].includes(e.status)) {
          setMe(null);
          clearOfflineProfile();
        }
        setMessage(
          e.status === 401
            ? hadSession.current
              ? t("انتهت جلسة الدخول. سجّل دخولك من جديد.")
              : ""
            : e.message,
        );
      } else {
        setOnline(false);
        const snapshot = readOfflineProfile(deviceId());
        if (snapshot) {
          setCsrf("");
          setMe(snapshot);
          setView("attendance");
          setMessage(
            t(
              "أنت بدون اتصال بالخادم. يمكنك تسجيل الحضور الآن، وستُرسل العمليات عند عودة الإنترنت.",
            ),
          );
        } else {
          setMe(null);
          setMessage(t("اتصل بالإنترنت لتجديد جلسة الدخول."));
        }
      }
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const on = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void refresh();
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, [refresh]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (me?.member && me.csrf && online)
      syncQueue(me.member.company_id, me.member.id).then(() =>
        setRevision((x) => x + 1),
      );
  }, [me?.member?.id, me?.csrf, online]);
  const act: Action = async (fn, success = t("تم الحفظ")) => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage(success);
      setRevision((x) => x + 1);
      if (online) await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const logout = async () => {
    await signOut();
    hadSession.current = false;
    setMe(null);
  };
  if (!ready) return <div className="loading">{t("عم نجهّز يومك…")}</div>;
  if (!me)
    return (
      <>
        <Auth onSuccess={refresh} />
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
      </>
    );
  if (me.mustChange)
    return (
      <div className="auth simple">
        <section className="auth-card">
          <LanguageSwitch />
          <Brand />
          <h1>{t("خلّي حسابك إلك")}</h1>
          <p>{t("غيّر PIN المؤقت قبل المتابعة.")}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() =>
                api("/auth/pin", {
                  currentPin: f.get("current"),
                  newPin: f.get("next"),
                }),
              );
            }}
          >
            <Field label={t("PIN الحالي")}>
              <input
                name="current"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
            <Field label={t("PIN الجديد (8 محارف على الأقل)")}>
              <input
                name="next"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </Field>
            <button disabled={busy}>{t("حفظ ومتابعة")}</button>
          </form>
          <p role="status">{message}</p>
        </section>
      </div>
    );
  if (!me.owner && !me.member)
    return (
      <div className="auth simple">
        <section className="auth-card">
          <LanguageSwitch />
          <Brand />
          <h1>{t("اختار شركتك")}</h1>
          {me.memberships.map((m: any) => (
            <button
              className="choice"
              key={m.id}
              disabled={busy}
              onClick={() =>
                void act(() =>
                  api(
                    m.status === "invited"
                      ? "/auth/accept-invitation"
                      : "/auth/select",
                    {
                      membershipId: m.id,
                    },
                  ),
                )
              }
            >
              {m.name}
              <span>
                {m.status === "invited" ? t("قبول الدعوة") : t("دخول")} ←
              </span>
            </button>
          ))}
          <p role="status">{message}</p>
          <button className="ghost" onClick={() => void act(logout, "")}>
            {t("تسجيل خروج")}
          </button>
        </section>
      </div>
    );
  if (me.locked)
    return (
      <div className="auth simple">
        <section className="auth-card">
          <LanguageSwitch />
          <ShieldCheck size={44} />
          <h1>{t("منكمّل بعد التجديد")}</h1>
          <p>
            {t("انتهى اشتراك")}
            {me.company.name}
            {t(
              "أو تم إيقافه. الدفع خارج التطبيق؛ تواصل مع مالك دوامي لتفعيل الاشتراك.",
            )}
          </p>
          <button onClick={() => void refresh()}>{t("تحقق من التفعيل")}</button>
          <button className="ghost" onClick={() => void act(logout, "")}>
            {t("تسجيل خروج")}
          </button>
        </section>
      </div>
    );
  const manager = me.owner || me.member.role !== "worker",
    nav: any[] = me.owner
      ? [
          ["owner", t("الشركات"), Building2],
          ["ownerSettings", t("إعدادات المنصة"), Settings],
          ["ownerRecovery", t("استعادة الحسابات"), ShieldCheck],
        ]
      : [
          ["dashboard", t("نظرة عامة"), LayoutDashboard],
          ["attendance", t("حضوري"), Clock3],
          ...(manager
            ? [
                ["members", t("فريق العمل"), Users],
                ["branches", t("الفروع والأقسام"), MapPin],
                ["devices", t("طلبات الأجهزة"), ShieldCheck],
                ["reviews", t("مراجعة الحضور"), Clock3],
              ]
            : []),
          ["notifications", t("الإشعارات"), Bell],
          ...(["gm", "am"].includes(me.member.role)
            ? [["settings", t("إعدادات الشركة"), Settings]]
            : []),
          ...(me.member.role === "gm"
            ? [["audit", t("سجل الرقابة"), ShieldCheck]]
            : []),
        ],
    pageContext = viewContext(
      view,
      nav.map(([id]) => id),
      me,
    ),
    actualView = pageContext.view;
  return (
    <LiteContext.Provider value={lite}>
      <div className="app">
        <a className="skip" href="#main">
          {t("انتقل للمحتوى")}
        </a>
        <aside>
          <Brand />
          <div className="workspace">
            {me.company?.logo_key ? (
              <img
                className="company-logo"
                src={
                  "/api/company/logo?v=" +
                  encodeURIComponent(me.company.logo_key)
                }
                alt={t("شعار الشركة")}
              />
            ) : (
              <Building2 size={23} />
            )}
            <div>
              <strong>{me.owner ? t("إدارة المنصة") : me.company.name}</strong>
              <small>
                {me.owner ? t("مالك دوامي") : roles[me.member.role]}
              </small>
            </div>
          </div>
          {!me.owner && me.mode === "global" && me.memberships.length > 1 && (
            <label className="workspace-switch">
              {t("الشركة")}
              <select
                aria-label={t("تبديل الشركة")}
                value={me.member.id}
                disabled={busy}
                onChange={(e) => {
                  const selected = me.memberships.find(
                    (m: any) => m.id === e.target.value,
                  );
                  void act(async () => {
                    await api(
                      selected.status === "invited"
                        ? "/auth/accept-invitation"
                        : "/auth/select",
                      {
                        membershipId: selected.id,
                      },
                    );
                    setView("dashboard");
                  });
                }}
              >
                {me.memberships
                  .filter((m: any) => ["active", "invited"].includes(m.status))
                  .map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.status === "invited" ? t(" — قبول الدعوة") : ""}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <span className="nav-caption">{t("مساحة العمل")}</span>
          <nav>
            {nav.map(([key, label, Icon]) => (
              <button
                className={actualView === key ? "active" : ""}
                key={key}
                onClick={() => {
                  setView(key);
                  setMessage("");
                }}
              >
                <Icon size={20} />
                {label}
                {actualView === key && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="help">
              <span>{t("كل يوم، أوضح.")}</span>
              <p>{t("حضور فريقك بمكان واحد.")}</p>
            </div>
            <small>{t("دوامي · المرحلة الأولى")}</small>
          </div>
        </aside>
        <div className="body">
          <header>
            <div className="breadcrumb">
              {t("مساحة العمل")}
              <ChevronLeft size={15} />
              <strong>{nav.find((x) => x[0] === actualView)?.[1]}</strong>
            </div>
            <div className="header-actions">
              <LanguageSwitch />
              <button
                className="ghost lite-toggle"
                aria-pressed={lite}
                onClick={() => setLite(!lite)}
              >
                {t("الوضع الخفيف:")}
                {lite ? t("مفعّل") : t("متوقف")}
              </button>
              <span className={online ? "connection" : "connection offline"}>
                {online ? <span className="dot" /> : <WifiOff size={14} />}{" "}
                {online ? t("متصل") : t("بدون اتصال")}
              </span>
              <button
                className="icon"
                aria-label={t("تبديل الوضع الداكن")}
                onClick={() => setDark(!dark)}
              >
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button
                className="icon"
                aria-label={t("تسجيل خروج")}
                onClick={() => void act(logout, "")}
              >
                <LogOut size={18} />
              </button>
              <span className="avatar">{me.name[0]}</span>
            </div>
          </header>
          <main id="main" key={pageContext.scope}>
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {new Intl.DateTimeFormat(locale, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  }).format(new Date())}
                </div>
                <h1>
                  {actualView === "dashboard"
                    ? t("صباح الشغل الحلو، {0}", [me.name.split(" ")[0]])
                    : nav.find((x) => x[0] === actualView)?.[1]}
                </h1>
                <p>
                  {actualView === "dashboard"
                    ? t("كل اللي بدك تعرفه عن فريقك اليوم.")
                    : t("تفاصيل واضحة، وقرارات بإيدك.")}
                </p>
              </div>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setRevision((x) => x + 1);
                  void refresh();
                }}
              >
                <RefreshCw size={16} />
                {t("تحديث")}
              </button>
            </div>
            {message && (
              <div className="notice" role="status">
                {message}
                <button
                  aria-label={t("إغلاق الرسالة")}
                  onClick={() => setMessage("")}
                >
                  ×
                </button>
              </div>
            )}
            {me.mode === "local" && (
              <div className="notice">
                {t("هذا الدخول خاص بشركة")}
                {me.company.name}
                {t("فقط.")}
              </div>
            )}
            {actualView === "dashboard" && (
              <Dashboard me={me} revision={revision} setView={setView} />
            )}
            {actualView === "attendance" && (
              <Attendance
                me={me}
                revision={revision}
                act={act}
                busy={busy}
                online={online}
              />
            )}
            {actualView === "members" && (
              <Members me={me} revision={revision} act={act} busy={busy} />
            )}
            {actualView === "branches" && (
              <Branches me={me} revision={revision} act={act} busy={busy} />
            )}
            {actualView === "settings" && (
              <CompanySettings me={me} act={act} busy={busy} />
            )}
            {actualView === "notifications" && (
              <Notifications revision={revision} act={act} />
            )}
            {actualView === "devices" && (
              <Devices revision={revision} act={act} />
            )}
            {actualView === "reviews" && (
              <AttendanceReviews revision={revision} act={act} busy={busy} />
            )}
            {actualView === "audit" && <Audit revision={revision} />}
            {actualView === "owner" && <Owner revision={revision} act={act} />}
            {actualView === "ownerSettings" && (
              <OwnerSettings revision={revision} act={act} busy={busy} />
            )}
            {actualView === "ownerRecovery" && (
              <OwnerRecovery revision={revision} act={act} busy={busy} />
            )}
          </main>
          <footer>
            {t("دوامي — يومك منظّم، وفريقك أقرب.")}
            <span>{t("حضور · فريق · وضوح")}</span>
          </footer>
        </div>
      </div>
    </LiteContext.Provider>
  );
}
function Dashboard({
  me,
  revision,
  setView,
}: {
  me: any;
  revision: number;
  setView: (s: string) => void;
}) {
  const { data, error } = useData("/dashboard", revision);
  if (error) return <div className="error">{error}</div>;
  if (!data) return <Empty text={t("عم نحمّل ملخص اليوم…")} />;
  return (
    <>
      <div className="stats">
        <Stat
          label={t("الحاضرون الآن")}
          value={data.present}
          suffix={`/ ${data.total}`}
          icon={<Users />}
          color="green"
        />
        <Stat
          label={t("نسبة الحضور الآن")}
          value={data.total ? Math.round((data.present / data.total) * 100) : 0}
          suffix="%"
          icon={<Check />}
          color="blue"
        />
        <Stat
          label={t("انصرفوا اليوم")}
          value={data.left}
          icon={<ArrowUpLeft />}
          color="slate"
        />
        <Stat
          label={t("أفراد الفريق")}
          value={data.total}
          icon={<Building2 />}
          color="violet"
        />
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <div className="card-title">
            <div>
              <h2>{t("فريقك اليوم")}</h2>
              <p>{t("آخر حالة حضور لكل فرد ضمن نطاقك")}</p>
            </div>
            <span className="badge green">{t("مباشر")}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("عضو الفريق")}</th>
                  <th>{t("الفرع")}</th>
                  <th>{t("الدخول")}</th>
                  <th>{t("الحالة")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((m: any) => (
                  <tr key={m.id}>
                    <td>
                      <div className="person">
                        <span className="avatar small">{m.name[0]}</span>
                        <div>
                          <strong>{m.name}</strong>
                          <small>{roles[m.role]}</small>
                        </div>
                      </div>
                    </td>
                    <td>{m.branch ?? t("غير معيّن")}</td>
                    <td className="number">{m.today ? time(m.in_at) : "—"}</td>
                    <td>
                      <span
                        className={
                          "badge " +
                          (m.present ? "green" : m.today ? "slate" : "amber")
                        }
                      >
                        {m.present
                          ? t("بالشغل")
                          : m.today
                            ? t("انصرف")
                            : t("ما بلّش")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.items.length && <Empty />}
        </section>
        <div className="side-cards">
          <section className="clock-card">
            <Clock3 size={38} />
            <span>{t("يومك إلو قيمة")}</span>
            <h2>{t("جاهز تبلّش؟")}</h2>
            <p>
              {t("سجّل حضورك من الفرع،")}
              <br />
              {t("وخلّي دوامي يتابع الوقت.")}
            </p>
            <button onClick={() => setView("attendance")}>
              {t("افتح حضوري")}
              <ArrowUpLeft size={18} />
            </button>
          </section>
          <section className="card compact">
            <span className="badge blue">
              {me.company.status === "trial"
                ? t("فترة تجريبية")
                : t("اشتراك فعّال")}
            </span>
            <h3>{me.company.name}</h3>
            <p>
              {t("متاح حتى")}{" "}
              {new Date(me.company.ends_at).toLocaleDateString(locale)}
            </p>
            <div className="mini-line" />
          </section>
        </div>
      </div>
    </>
  );
}
function Stat({
  label,
  value,
  suffix = "",
  icon,
  color,
}: {
  label: string;
  value: number;
  suffix?: string;
  icon: ReactNode;
  color: string;
}) {
  return (
    <section className="stat">
      <div>
        <span>{label}</span>
        <h2>
          <bdi dir="ltr">
            {value}
            <small>{suffix}</small>
          </bdi>
        </h2>
      </div>
      <span className={"stat-icon " + color}>{icon}</span>
    </section>
  );
}
function Attendance({
  me,
  revision,
  act,
  busy,
  online,
}: {
  me: any;
  revision: number;
  act: Action;
  busy: boolean;
  online: boolean;
}) {
  const { data, error } = useData("/attendance/mine", revision, online),
    [ops, setOps] = useState<Operation[]>([]),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    void localDB.operations
      .where("[companyId+membershipId]")
      .equals([me.member.company_id, me.member.id])
      .sortBy("deviceTime")
      .then(setOps);
  }, [revision, me.member.id, me.member.company_id]);
  const open = attendanceView(data?.items, ops);
  const awaitingServer = online && !data;
  const perform = (action: "in" | "out") =>
    act(
      async () => {
        if (me.expires <= Date.now())
          throw new Error(t("اتصل بالإنترنت لتجديد جلسة الدخول."));
        const gps = await getCurrentLocation();
        const payload = {
          id: crypto.randomUUID(),
          action,
          deviceTime: Date.now(),
          lat: gps.coords.latitude,
          lng: gps.coords.longitude,
          accuracy: gps.coords.accuracy,
          offline: !online,
        };
        await localDB.operations.add({
          ...payload,
          companyId: me.member.company_id,
          membershipId: me.member.id,
          state: "pending",
        });
        if (online) {
          try {
            const r = await api("/attendance/punch", payload);
            await localDB.operations.update(payload.id, {
              state: r.status,
              message: r.reason,
            });
          } catch (e) {
            if (e instanceof ApiError) {
              await localDB.operations.update(payload.id, {
                state:
                  e.status >= 500 || [401, 403, 429].includes(e.status)
                    ? "pending"
                    : "error",
                message: e.message,
              });
              throw e;
            }
            // Keep the submitted payload immutable: the server may have committed it before the response was lost.
            await localDB.operations.update(payload.id, {
              message: t("تعذّر تأكيد الإرسال. العملية محفوظة لإعادة المحاولة"),
            });
          }
        }
        navigator.vibrate?.(80);
      },
      online
        ? t("تم إرسال عملية الحضور")
        : t("انحفظت العملية بانتظار المزامنة"),
    );
  return (
    <>
      <div className="two-col">
        <section className="card padded">
          <h2>{t("حضوري اليوم")}</h2>
          <p>{t("الموقع يُستخدم فقط وقت التسجيل.")}</p>
          <div className="timer" dir="ltr">
            {open
              ? elapsedTime(open.in_at, now)
              : awaitingServer
                ? "—"
                : "00:00:00"}
          </div>
          <p>
            {awaitingServer
              ? error
                ? t("تعذّر التحقق من جلسة الحضور. اضغط تحديث لإعادة المحاولة.")
                : t("عم نتحقق من جلسة الحضور…")
              : open
                ? open.provisional
                  ? t("وقت محلي مؤقت — بانتظار تحقق الخادم")
                  : t("وقت الجلسة الحالية")
                : t("ما عندك جلسة مفتوحة")}
          </p>
          {!me.deviceBound ? (
            <>
              <p>{t("هذا الجهاز غير مربوط بعضويتك.")}</p>
              <button
                disabled={busy}
                onClick={() =>
                  void act(() => api("/device/bind", {}), t("تم ربط الجهاز"))
                }
              >
                {t("ربط الجهاز لأول مرة")}
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act(
                    () =>
                      api("/device/rebind", {
                        reason: f.get("reason"),
                      }),
                    t("تم إرسال طلب إعادة الربط"),
                  );
                }}
              >
                <Field label={t("سبب إعادة الربط")}>
                  <input name="reason" required minLength={3} />
                </Field>
                <button className="secondary" disabled={busy}>
                  {t("طلب إعادة ربط")}
                </button>
              </form>
            </>
          ) : (
            <div className="punch-buttons">
              <button
                disabled={busy || awaitingServer || (online && !!open)}
                onClick={() => void perform("in")}
              >
                {t("تسجيل دخول")}
              </button>
              <button
                disabled={busy || awaitingServer || (online && !open)}
                className="secondary"
                onClick={() => void perform("out")}
              >
                {t("تسجيل خروج")}
              </button>
            </div>
          )}
          {online && <p className="error">{error}</p>}
          {!online && (
            <p role="status">
              {t(
                "بدون إنترنت: العمليات والوقت الظاهر محفوظة على هذا الجهاز، وتُراجع عند المزامنة.",
              )}
            </p>
          )}
        </section>
        <section className="card padded">
          <h2>{t("حالة المزامنة")}</h2>
          <p>{t("كل عملية مرتبطة بشركتك الحالية فقط.")}</p>
          {ops.length ? (
            ops
              .slice(-8)
              .reverse()
              .map((o) => (
                <div className="list-row" key={o.id}>
                  <div>
                    <strong>
                      {o.action === "in" ? t("دخول") : t("خروج")} ·{" "}
                      {time(o.deviceTime)}
                    </strong>
                    <small>{t(o.message || "")}</small>
                  </div>
                  <span className="badge slate">
                    {
                      {
                        pending: t("بانتظار المزامنة"),
                        accepted: t("مقبول"),
                        review: t("للمراجعة"),
                        error: t("تعذّر الاعتماد"),
                      }[o.state]
                    }
                  </span>
                </div>
              ))
          ) : (
            <Empty text={t("كل شي محدّث")} />
          )}
          <button
            className="secondary"
            disabled={busy || !online}
            onClick={() =>
              void act(
                () => syncQueue(me.member.company_id, me.member.id),
                t("تمت محاولة المزامنة"),
              )
            }
          >
            {t("مزامنة الآن")}
          </button>
        </section>
      </div>
      <section className="card">
        <div className="card-title">
          <h2>{t("جلساتي الأخيرة")}</h2>
        </div>
        {!data ? (
          <p className="padded" role="status">
            {online
              ? error
                ? t("تعذّر تحميل سجل الحضور. اضغط تحديث لإعادة المحاولة.")
                : t("عم نحمّل سجل الحضور…")
              : t("سجل الجلسات السابق بيتحمّل لما يرجع الإنترنت.")}
          </p>
        ) : data.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("التاريخ")}</th>
                  <th>{t("الفرع")}</th>
                  <th>{t("الدخول")}</th>
                  <th>{t("الخروج")}</th>
                  <th>{t("المدة")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s: any) => (
                  <tr key={s.id}>
                    <td>{s.work_date}</td>
                    <td>{s.branch}</td>
                    <td>{time(s.in_at)}</td>
                    <td>{time(s.out_at)}</td>
                    <td>
                      {Math.floor(((s.out_at ?? now) - s.in_at) / 60000)}
                      {t("دقيقة")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </section>
    </>
  );
}
function Branches({
  me,
  revision,
  act,
  busy,
}: {
  me: any;
  revision: number;
  act: Action;
  busy: boolean;
}) {
  const { data } = useData("/branches", revision),
    departments = useData("/departments", revision),
    [selected, setSelected] = useState<any>(null),
    [branchPoint, setBranchPoint] = useState<Point | null>(null),
    [branchRadius, setBranchRadius] = useState(150),
    [editingBranch, setEditingBranch] = useState<any>(null);
  const manage = ["gm", "am"].includes(me.member.role);
  return (
    <>
      <div className="two-col">
        <section className="card padded">
          <h2>{t("الفروع ونطاق الحضور")}</h2>
          {data?.items.map((b: any) => (
            <button
              className="choice"
              key={b.id}
              onClick={() => setSelected(b)}
            >
              <span>{b.name}</span>
              <span>
                {b.radius}
                {t("م · عرض الموقع")}
              </span>
            </button>
          ))}
          {!data?.items.length && (
            <Empty text={t("أضف أول فرع لتسجيل الحضور")} />
          )}
          {selected && manage && (
            <button
              type="button"
              onClick={() => {
                setEditingBranch(selected);
                setBranchPoint({ lat: selected.lat, lng: selected.lng });
                setBranchRadius(selected.radius);
              }}
            >
              {t("تعديل هذا الفرع")}
            </button>
          )}
          {selected && (
            <Suspense fallback={<Empty text={t("عم نحمّل الخريطة…")} />}>
              <OptionalMap
                lat={selected.lat}
                lng={selected.lng}
                radius={selected.radius}
              />
            </Suspense>
          )}
        </section>
        {manage && (
          <section className="card padded">
            <h2>{editingBranch ? t("تعديل الفرع") : t("إضافة فرع")}</h2>
            {editingBranch && (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setEditingBranch(null);
                  setBranchPoint(null);
                  setBranchRadius(150);
                }}
              >
                {t("إلغاء التعديل وإضافة فرع جديد")}
              </button>
            )}
            <form
              key={editingBranch?.id ?? "new"}
              onSubmit={(e) => {
                e.preventDefault();
                if (!branchPoint) return;
                const f = new FormData(e.currentTarget);
                void act(() =>
                  api(
                    editingBranch
                      ? `/branches/${editingBranch.id}`
                      : "/branches",
                    {
                      name: f.get("name"),
                      lat: branchPoint.lat,
                      lng: branchPoint.lng,
                      radius: Number(f.get("radius")),
                      ...(editingBranch ? { reason: f.get("reason") } : {}),
                    },
                    editingBranch ? "PUT" : "POST",
                  ),
                );
              }}
            >
              <Field label={t("اسم الفرع")}>
                <input
                  name="name"
                  required
                  minLength={2}
                  defaultValue={editingBranch?.name ?? ""}
                />
              </Field>
              {editingBranch && (
                <Field label={t("سبب التعديل")}>
                  <input name="reason" required minLength={3} />
                </Field>
              )}
              <LocationPicker
                value={branchPoint}
                onChange={setBranchPoint}
                radius={branchRadius}
              />
              <Field label={t("نطاق الحضور بالمتر")}>
                <input
                  name="radius"
                  type="number"
                  min={10}
                  max={10000}
                  value={branchRadius}
                  onChange={(e) => setBranchRadius(Number(e.target.value))}
                  required
                />
              </Field>
              <button disabled={busy || !branchPoint}>{t("حفظ الفرع")}</button>
            </form>
          </section>
        )}
      </div>
      <section className="card padded">
        <h2>{t("الأقسام")}</h2>
        <div className="chips">
          {departments.data?.items.map((d: any) => (
            <span key={d.id} className="badge blue">
              {d.name}
            </span>
          ))}
        </div>
        {manage && (
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() =>
                api("/departments", {
                  name: f.get("name"),
                }),
              );
            }}
          >
            <Field label={t("اسم القسم الجديد")}>
              <input name="name" required minLength={2} />
            </Field>
            <button disabled={busy}>{t("إضافة قسم")}</button>
          </form>
        )}
      </section>
    </>
  );
}
function Members({
  me,
  revision,
  act,
  busy,
}: {
  me: any;
  revision: number;
  act: Action;
  busy: boolean;
}) {
  const members = useData("/members", revision),
    branches = useData("/branches", revision),
    departments = useData("/departments", revision),
    [reset, setReset] = useState<any>(null),
    [rows, setRows] = useState<any[]>([]),
    [importError, setImportError] = useState("");
  const editorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reset) {
      editorRef.current?.focus({ preventScroll: true });
      editorRef.current?.scrollIntoView({ block: "start" });
    }
  }, [reset]);
  const canResetSelected =
    reset &&
    (me.member.role === "gm"
      ? ["worker", "manager", "am"].includes(reset.role)
      : ["am", "manager"].includes(me.member.role) && reset.role === "worker");
  const canCreate = ["gm", "manager"].includes(me.member.role);
  return (
    <>
      <section className="card">
        <div className="card-title">
          <h2>{t("فريق العمل")}</h2>
          <span className="badge blue">
            {members.data?.items.length ?? 0}
            {t("عضو")}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("إدارة")}</th>
                <th>{t("الاسم")}</th>
                <th>{t("الهاتف")}</th>
                <th>{t("الدور")}</th>
                <th>{t("الفرع")}</th>
                <th>{t("الحالة")}</th>
              </tr>
            </thead>
            <tbody>
              {members.data?.items.map((m: any) => (
                <tr key={m.id}>
                  <td>
                    <button
                      type="button"
                      className="text-button"
                      aria-controls="member-editor"
                      aria-expanded={reset?.id === m.id}
                      onClick={() => setReset({ ...m })}
                    >
                      {t("إدارة")}
                    </button>
                  </td>
                  <td>{m.name}</td>
                  <td dir="ltr">{m.phone}</td>
                  <td>{roles[m.role]}</td>
                  <td>{m.branch ?? t("غير معيّن")}</td>
                  <td>
                    <span className="badge slate">
                      {m.status === "invited"
                        ? t("دعوة معلقة")
                        : m.bound
                          ? t("جهاز مربوط")
                          : t("بانتظار الربط")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {reset && (
        <section
          id="member-editor"
          ref={editorRef}
          tabIndex={-1}
          aria-labelledby="member-editor-title"
          className="card padded"
          key={reset.id}
        >
          <h2 id="member-editor-title">
            {t("إدارة")} {reset.name}
          </h2>
          <button
            type="button"
            className="ghost"
            onClick={() => setReset(null)}
          >
            {t("إغلاق")}
          </button>
          {canResetSelected && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(
                  () =>
                    api(`/members/${reset.id}/reset`, {
                      pin: f.get("pin"),
                      reason: f.get("reason"),
                    }),
                  t("أعط العامل رمز الشركة: {0}", [me.company.id]),
                );
              }}
            >
              <Field label={t("PIN مؤقت جديد")}>
                <input name="pin" type="password" minLength={8} required />
              </Field>
              <Field label={t("سبب إعادة التعيين")}>
                <input name="reason" minLength={3} required />
              </Field>
              <button disabled={busy}>{t("إعادة تعيين ضمن هذه الشركة")}</button>
              <button
                type="button"
                className="ghost"
                onClick={() => setReset(null)}
              >
                {t("إغلاق")}
              </button>
            </form>
          )}
          {me.member.role === "gm" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(() =>
                  api(`/members/${reset.id}/assignment`, {
                    branchId: f.get("branchId"),
                    departmentId: f.get("departmentId") || null,
                    reason: f.get("reason"),
                  }),
                );
              }}
            >
              <h3>{t("تعيين الفرع والقسم")}</h3>
              {branches.data?.items.length === 0 && (
                <p role="status">
                  {t("أنشئ فرعاً من صفحة الفروع أولاً، ثم ارجع لتعيينه.")}
                </p>
              )}
              <Field label={t("الفرع")}>
                <select
                  name="branchId"
                  required
                  defaultValue={reset.branch_id || ""}
                >
                  <option value="" disabled>
                    {t("اختر الفرع")}
                  </option>
                  {branches.data?.items.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("القسم")}>
                <select
                  name="departmentId"
                  defaultValue={reset.department_id || ""}
                >
                  <option value="">{t("بدون قسم")}</option>
                  {departments.data?.items.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("السبب")}>
                <input name="reason" required minLength={3} />
              </Field>
              <button disabled={busy || !branches.data?.items.length}>
                {t("حفظ التعيين")}
              </button>
            </form>
          )}
        </section>
      )}
      {canCreate && (
        <div className="two-col">
          <section className="card padded">
            <h2>{t("إضافة عضو للفريق")}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(
                  () =>
                    api("/members", {
                      name: f.get("name"),
                      phone: f.get("phone"),
                      pin: f.get("pin"),
                      role: f.get("role"),
                      branchId: f.get("branchId"),
                      departmentId: f.get("departmentId") || null,
                    }),
                  t("تم إنشاء العضوية؛ الهوية الموجودة تستقبل دعوة"),
                );
              }}
            >
              <Field label={t("الاسم الكامل")}>
                <input name="name" minLength={2} required />
              </Field>
              <Field label={t("رقم الموبايل")}>
                <input
                  name="phone"
                  type="tel"
                  dir="ltr"
                  placeholder="+963…"
                  required
                />
              </Field>
              <Field label={t("PIN أولي للهوية الجديدة فقط")}>
                <input name="pin" type="password" minLength={8} required />
              </Field>
              <Field label={t("الدور")}>
                <select name="role" defaultValue="worker">
                  {Object.entries(roles)
                    .filter(([k]) => me.member.role === "gm" || k === "worker")
                    .map(([k, v]) => (
                      <option value={k} key={k}>
                        {v}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={t("الفرع")}>
                <select name="branchId" required>
                  {branches.data?.items.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("القسم")}>
                <select name="departmentId">
                  <option value="">{t("بدون قسم")}</option>
                  {departments.data?.items.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button disabled={busy}>{t("إضافة العضو")}</button>
            </form>
          </section>
          <section className="card padded">
            <h2>{t("استيراد العمال من Excel")}</h2>
            <p>
              {t(
                "الأعمدة: الاسم، الهاتف، الفرع، القسم. راجع المعاينة قبل الحفظ. الحساب الموجود عالمياً تصله دعوة.",
              )}
            </p>
            <input
              aria-label={t("ملف Excel")}
              type="file"
              accept=".xlsx"
              onChange={async (e) => {
                setImportError("");
                try {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2_000_000)
                    throw new Error(t("الملف أكبر من 2 ميغابايت"));
                  const { readSheet: readXlsxFile } =
                    await import("read-excel-file/browser");
                  const all = await readXlsxFile(file);
                  if (all.length > 201)
                    throw new Error(t("حتى 200 عامل لكل ملف"));
                  if (
                    ![
                      "الاسم|الهاتف|الفرع|القسم",
                      "Name|Phone|Branch|Department",
                    ].includes(all[0]?.slice(0, 4).join("|") ?? "")
                  )
                    throw new Error(
                      t("رتّب الأعمدة: الاسم، الهاتف، الفرع، القسم"),
                    );
                  const seen = new Set<string>();
                  setRows(
                    all.slice(1).map((row: any[]) => {
                      const phone = String(row[1] ?? ""),
                        branch = branches.data?.items.find(
                          (b: any) => b.name === String(row[2] ?? ""),
                        ),
                        department = departments.data?.items.find(
                          (d: any) => d.name === String(row[3] ?? ""),
                        );
                      const error = !/^\+[1-9]\d{7,14}$/.test(phone)
                        ? t("الهاتف غير صحيح")
                        : seen.has(phone) ||
                            members.data?.items.some(
                              (m: any) => m.phone === phone,
                            )
                          ? t("رقم مكرر")
                          : !branch
                            ? t("الفرع غير معروف")
                            : row[3] && !department
                              ? t("القسم غير معروف")
                              : String(row[0] ?? "").length < 2
                                ? t("الاسم غير صحيح")
                                : "";
                      seen.add(phone);
                      return {
                        name: String(row[0] ?? ""),
                        phone,
                        branchId: branch?.id,
                        departmentId: department?.id ?? null,
                        error,
                        pin: crypto.randomUUID().slice(0, 12),
                        saved: false,
                      };
                    }),
                  );
                } catch (e) {
                  setImportError((e as Error).message);
                }
              }}
            />
            <p className="error">{importError}</p>
            {rows.map((r, i) => (
              <div className="list-row" key={i}>
                <div>
                  <strong>{r.name}</strong>
                  <small>
                    {r.phone} ·{" "}
                    {r.error || (r.saved ? t("تمت الإضافة") : t("جاهز"))}
                  </small>
                </div>
                <span>{r.saved ? "✓" : ""}</span>
              </div>
            ))}
            {rows.length > 0 && (
              <>
                <p>
                  {t(
                    "احفظ بيانات PIN المؤقتة بعد الإضافة لتسليمها للعامل بأمان. لا تُرسل عبر إشعارات.",
                  )}
                </p>
                <button
                  disabled={busy || rows.some((r) => r.error)}
                  onClick={() =>
                    void act(async () => {
                      for (let i = 0; i < rows.length; i++) {
                        if (rows[i].saved) continue;
                        await api("/members", {
                          ...rows[i],
                          role: "worker",
                        });
                        rows[i].saved = true;
                        setRows([...rows]);
                      }
                    }, t("تم الاستيراد"))
                  }
                >
                  {t("اعتماد الاستيراد")}
                </button>
                <details>
                  <summary>{t("PIN المؤقت لكل صف")}</summary>
                  {rows.map((r, i) => (
                    <p key={i}>
                      {r.name}: <code>{r.pin}</code>
                    </p>
                  ))}
                </details>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
function CompanySettings({
  me,
  act,
  busy,
}: {
  me: any;
  act: Action;
  busy: boolean;
}) {
  return (
    <section className="card padded narrow">
      <h2>{t("إعدادات شركتك")}</h2>
      {!me.logoUploads && (
        <p>{t("رفع الشعار غير متاح حتى تفعيل تخزين الملفات")}</p>
      )}
      <Field label={t("شعار الشركة (PNG أو JPEG)")}>
        <input
          type="file"
          accept="image/png,image/jpeg"
          disabled={busy || !me.logoUploads}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void act(() => uploadLogo(file), t("تم تحديث الشعار"));
            e.target.value = "";
          }}
        />
      </Field>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void act(() =>
            api(
              "/company",
              {
                name: f.get("name"),
                currency: f.get("currency"),
                timezone: f.get("timezone"),
                sessionDays: Number(f.get("sessionDays")),
                gpsAccuracy: Number(f.get("gpsAccuracy")),
              },
              "PUT",
            ),
          );
        }}
      >
        <Field label={t("اسم الشركة")}>
          <input
            name="name"
            defaultValue={me.company.name}
            required
            minLength={2}
          />
        </Field>
        <Field label={t("العملة")}>
          <CurrencySelect value={me.company.currency} />
        </Field>
        <Field label={t("المنطقة الزمنية")}>
          <input name="timezone" defaultValue={me.company.timezone} required />
        </Field>
        <Field label={t("مدة الجلسة بالأيام")}>
          <input
            name="sessionDays"
            type="number"
            min={1}
            max={30}
            defaultValue={me.company.session_days}
          />
        </Field>
        <Field label={t("أعلى خطأ مسموح لدقة GPS بالمتر")}>
          <input
            name="gpsAccuracy"
            type="number"
            min={10}
            max={500}
            defaultValue={me.company.gps_accuracy}
          />
        </Field>
        <button disabled={busy}>{t("حفظ الإعدادات")}</button>
      </form>
      <small>{t("رمز الشركة للدخول المؤقت:")}</small>
      <p dir="ltr">
        <code>{me.company.id}</code>
      </p>
    </section>
  );
}
function Notifications({ revision, act }: { revision: number; act: Action }) {
  const { data, error } = useData("/notifications", revision),
    [location, setLocation] = useState<{
      lat: number;
      lng: number;
    } | null>(null);
  useEffect(() => {
    setLocation(notificationLocation(window.location.href));
  }, []);
  return (
    <section className="card padded" aria-busy={!data && !error}>
      <div className="notification-heading">
        <h2>{t("مركز الإشعارات")}</h2>
      </div>
      <PushControls />
      <p className="error" role="alert">
        {error}
      </p>
      {location && (
        <Suspense fallback={<Empty />}>
          <OptionalMap {...location} />
        </Suspense>
      )}
      {!data && !error && <p role="status">{t("عم نحمّل الإشعارات…")}</p>}
      {data?.items.length ? (
        data.items.map((n: any) => (
          <button
            className="notification"
            key={n.id}
            onClick={() =>
              void act(async () => {
                await api(`/notifications/${n.id}/read`, {});
                setLocation(notificationLocation(n.url));
              }, t("تمت قراءة الإشعار"))
            }
          >
            <span className={"stat-icon " + (n.read_at ? "slate" : "blue")}>
              <Bell size={20} />
            </span>
            <div>
              <strong>{n.title}</strong>
              <p>{n.body}</p>
              <small>{time(n.created_at)}</small>
            </div>
          </button>
        ))
      ) : data && !error ? (
        <Empty text={t("الإشعارات الجديدة بتظهر هون")} />
      ) : null}
    </section>
  );
}
function AttendanceReviews({
  revision,
  act,
  busy,
}: {
  revision: number;
  act: Action;
  busy: boolean;
}) {
  const { data, error } = useData("/attendance/reviews", revision);
  return (
    <section className="card padded" aria-busy={!data && !error}>
      <h2>{t("مراجعة أحداث الحضور")}</h2>
      <p>
        {t(
          "راجع وقت الجهاز والموقع، واحسم الدخول قبل الخروج. الحدث لا يدخل بساعات العمل قبل اعتماده.",
        )}
      </p>
      <p className="error" role="alert">
        {error}
      </p>
      {!data && !error && <p role="status">{t("عم نحمّل مراجعات الحضور…")}</p>}
      {data?.items.length ? (
        data.items.map((r: any) => (
          <form
            key={r.id}
            className="card padded"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const decision = (
                e.nativeEvent as SubmitEvent
              ).submitter?.getAttribute("value");
              void act(
                () =>
                  api("/attendance/reviews/" + r.id, {
                    decision,
                    reason: f.get("reason"),
                  }),
                t("تم حفظ قرار المراجعة"),
              );
            }}
          >
            <h3>
              {r.name} · {r.payload.action === "in" ? t("دخول") : t("خروج")}
            </h3>
            <p>
              {r.branch} — {t(r.result.reason)}
            </p>
            <p>
              {t("وقت الجهاز:")}{" "}
              <time>
                {new Date(r.payload.deviceTime).toLocaleString(locale)}
              </time>
              <br />
              {t("وقت الاستلام:")}{" "}
              {new Date(r.received_at).toLocaleString(locale)}
            </p>
            <p>
              {t("الموقع:")}{" "}
              <bdi>
                {r.payload.lat}, {r.payload.lng}
              </bdi>{" "}
              {t("· دقة ±")}
              {r.payload.accuracy}
              {t("م")}
            </p>
            <Field label={t("سبب القرار")}>
              <input
                name="reason"
                required
                minLength={5}
                maxLength={500}
                placeholder={t("اذكر كيف تحققت من الحدث")}
              />
            </Field>
            <button type="submit" value="approve" disabled={busy}>
              {t("اعتماد الحدث")}
            </button>{" "}
            <button
              className="ghost"
              type="submit"
              value="reject"
              disabled={busy}
            >
              {t("رفض الحدث")}
            </button>
          </form>
        ))
      ) : data && !error ? (
        <Empty />
      ) : null}
    </section>
  );
}
function Devices({ revision, act }: { revision: number; act: Action }) {
  const { data, error } = useData("/device/requests", revision);
  return (
    <section className="card padded" aria-busy={!data && !error}>
      <h2>{t("طلبات إعادة ربط الأجهزة")}</h2>
      <p className="error" role="alert">
        {error}
      </p>
      {!data && !error && <p role="status">{t("عم نحمّل طلبات الأجهزة…")}</p>}
      {data?.items.length ? (
        data.items.map((r: any) => (
          <div className="list-row" key={r.id}>
            <div>
              <strong>{r.name}</strong>
              <p>{r.reason}</p>
            </div>
            <button
              onClick={() =>
                void act(() => api(`/device/requests/${r.id}/approve`, {}))
              }
            >
              {t("موافقة")}
            </button>
          </div>
        ))
      ) : data && !error ? (
        <Empty />
      ) : null}
    </section>
  );
}
function Audit({ revision }: { revision: number }) {
  const { data, error } = useData("/audit", revision);
  return (
    <section className="card">
      <div className="card-title">
        <h2>{t("سجل الرقابة")}</h2>
        <span className="badge blue">{t("قراءة فقط · المدير العام")}</span>
      </div>
      <p className="error">{error}</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("الوقت")}</th>
              <th>{t("العملية")}</th>
              <th>{t("الفاعل")}</th>
              <th>{t("السبب")}</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((a: any) => (
              <tr key={a.id}>
                <td>{new Date(a.created_at).toLocaleString(locale)}</td>
                <td>
                  <code>{a.action}</code>
                </td>
                <td>{a.actor.slice(0, 8)}</td>
                <td>{a.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Owner({ revision, act }: { revision: number; act: Action }) {
  const { data, error } = useData("/owner/companies", revision);
  if (!data)
    return (
      <section className="card padded" aria-busy={!error}>
        <h2>{t("دليل الشركات")}</h2>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : (
          <p role="status">{t("عم نحمّل بيانات الشركات…")}</p>
        )}
      </section>
    );
  return (
    <>
      <div className="stats">
        <Stat
          label={t("الشركات")}
          value={data?.items.length ?? 0}
          icon={<Building2 />}
          color="blue"
        />
        <Stat
          label={t("بالتجربة")}
          value={
            data?.items.filter(
              (c: any) => c.status === "trial" && c.ends_at > Date.now(),
            ).length ?? 0
          }
          icon={<Clock3 />}
          color="green"
        />
      </div>
      <section className="card">
        <div className="card-title">
          <h2>{t("دليل الشركات")}</h2>
          <small>{t("التفعيل بعد الدفع خارج التطبيق")}</small>
        </div>
        <p className="error">{error}</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("الشركة")}</th>
                <th>{t("العمال")}</th>
                <th>{t("الحالة")}</th>
                <th>{t("نهاية الاشتراك")}</th>
                <th>{t("إدارة الاشتراك")}</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((co: any) => (
                <tr key={co.id}>
                  <td>{co.name}</td>
                  <td>{co.workers}</td>
                  <td>
                    <span className="badge slate">
                      {co.status === "suspended"
                        ? t("موقوف")
                        : co.ends_at < Date.now()
                          ? t("منتهي")
                          : co.status === "trial"
                            ? t("تجريبي")
                            : t("فعال")}
                    </span>
                  </td>
                  <td>{new Date(co.ends_at).toLocaleDateString(locale)}</td>
                  <td>
                    <div className="actions">
                      {[
                        ["month", t("شهر")],
                        ["year", t("سنة")],
                        ["trial", t("تجربة")],
                        ["suspend", t("إيقاف")],
                      ].map(([action, label]) => (
                        <button
                          className="secondary"
                          key={action}
                          onClick={() => {
                            const reason = prompt(
                              t("سبب التفعيل أو الإيقاف (للتدقيق)"),
                            );
                            if (reason)
                              void act(() =>
                                api(`/owner/companies/${co.id}/subscription`, {
                                  action,
                                  reason,
                                }),
                              );
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.items.length && (
          <Empty text={t("أول شركة بتسجّل رح تظهر هون")} />
        )}
      </section>
    </>
  );
}
function OwnerSettings({
  revision,
  act,
  busy,
}: {
  revision: number;
  act: Action;
  busy: boolean;
}) {
  const { data, error } = useData("/owner/companies", revision);
  return (
    <section className="card padded narrow">
      <h2>{t("التجربة والأسعار")}</h2>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">{t("عم نحمّل إعدادات المنصة…")}</p>}
      {data && (
        <form
          key={revision}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(() =>
              api(
                "/owner/settings",
                {
                  trialDays: Number(f.get("trialDays")),
                  monthly: Number(f.get("monthly")),
                  yearly: Number(f.get("yearly")),
                },
                "PUT",
              ),
            );
          }}
        >
          <Field label={t("مدة التجربة بالأيام")}>
            <input
              name="trialDays"
              type="number"
              min={1}
              max={365}
              defaultValue={data.settings?.trial_days ?? 14}
            />
          </Field>
          <Field label={t("السعر الشهري (بوحدة التسعير المتفق عليها)")}>
            <input
              name="monthly"
              type="number"
              min={0}
              defaultValue={data.settings?.monthly ?? 0}
            />
          </Field>
          <Field label={t("السعر السنوي")}>
            <input
              name="yearly"
              type="number"
              min={0}
              defaultValue={data.settings?.yearly ?? 0}
            />
          </Field>
          <button disabled={busy}>{t("حفظ")}</button>
        </form>
      )}
      <p>{t("الأسعار للتسجيل فقط؛ لا تحصيل إلكتروني.")}</p>
    </section>
  );
}
function OwnerRecovery({
  revision,
  act,
  busy,
}: {
  revision: number;
  act: Action;
  busy: boolean;
}) {
  const companies = useData("/owner/companies", revision),
    rebinds = useData("/owner/rebinds", revision),
    [companyId, setCompanyId] = useState(""),
    [managerResult, setManagerResult] = useState<{
      companyId: string;
      items: any[];
      error: string;
    } | null>(null);
  useEffect(() => {
    let active = true;
    setManagerResult(null);
    if (!companyId) return;
    api(`/owner/companies/${companyId}/managers`)
      .then((x) => {
        if (active) setManagerResult({ companyId, items: x.items, error: "" });
      })
      .catch((e) => {
        if (active)
          setManagerResult({ companyId, items: [], error: e.message });
      });
    return () => {
      active = false;
    };
  }, [companyId, revision]);
  const currentManagers =
    managerResult?.companyId === companyId ? managerResult : null;
  const managers = currentManagers?.items ?? [];
  const canReset = Boolean(
    companyId && managers.length && !currentManagers?.error,
  );
  return (
    <>
      <div className="two-col">
        <section className="card padded">
          <h2>{t("استعادة دخول مدير عام ضمن شركته")}</h2>
          {companies.error && (
            <p className="error" role="alert">
              {companies.error}
            </p>
          )}
          {!companies.data && !companies.error && (
            <p role="status">{t("عم نحمّل بيانات الشركات…")}</p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!canReset || busy) return;
              const f = new FormData(e.currentTarget);
              void act(() =>
                api(`/owner/companies/${companyId}/reset-gm`, {
                  membershipId: f.get("membershipId"),
                  pin: f.get("pin"),
                  reason: f.get("reason"),
                }),
              );
            }}
          >
            <Field label={t("الشركة")}>
              <select
                required
                value={companyId}
                onChange={(e) => {
                  setManagerResult(null);
                  setCompanyId(e.target.value);
                }}
              >
                <option value="">{t("اختار الشركة")}</option>
                {companies.data?.items.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("المدير")}>
              <select
                key={companyId}
                name="membershipId"
                required
                disabled={!canReset || busy}
              >
                {!managers.length && (
                  <option value="">{t("اختار المدير")}</option>
                )}
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            {companyId && !currentManagers && (
              <p role="status">{t("عم نحمّل مدراء الشركة…")}</p>
            )}
            {currentManagers?.error && (
              <p className="error" role="alert">
                {currentManagers.error}
              </p>
            )}
            {currentManagers && !currentManagers.error && !managers.length && (
              <p role="status">{t("ما في مدير عام بهالشركة.")}</p>
            )}
            <Field label={t("PIN المؤقت")}>
              <input name="pin" type="password" minLength={8} required />
            </Field>
            <Field label={t("سبب التحقق وإعادة التعيين")}>
              <input name="reason" minLength={5} required />
            </Field>
            <button disabled={busy || !canReset}>{t("إعادة التعيين")}</button>
          </form>
          {companyId && <p dir="ltr">{companyId}</p>}
        </section>
        <section className="card padded">
          <h2>{t("استعادة الهوية العامة")}</h2>
          <p>
            {t(
              "بعد التحقق اليدوي من صاحب الهوية. تؤثر على الدخول العام لكل الشركات. لا ترفع وثائق هوية.",
            )}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void act(() =>
                api("/owner/recover-identity", {
                  phone: f.get("phone"),
                  pin: f.get("pin"),
                  reason: f.get("reason"),
                }),
              );
            }}
          >
            <Field label={t("رقم الهاتف")}>
              <input name="phone" type="tel" required dir="ltr" />
            </Field>
            <Field label={t("PIN المؤقت")}>
              <input name="pin" type="password" minLength={8} required />
            </Field>
            <Field label={t("كيف تحققت من الهوية؟")}>
              <textarea name="reason" minLength={10} required />
            </Field>
            <label className="check-label">
              <input type="checkbox" required />
              {t("تحققت من صاحب الحساب شخصياً")}
            </label>
            <button disabled={busy}>
              {t("استعادة الهوية وتسجيل العملية")}
            </button>
          </form>
        </section>
      </div>
      <section className="card padded">
        <h2>{t("إعادة ربط أجهزة المدراء العامين")}</h2>
        {rebinds.error && (
          <p className="error" role="alert">
            {rebinds.error}
          </p>
        )}
        {!rebinds.data && !rebinds.error && (
          <p role="status">{t("عم نحمّل طلبات الأجهزة…")}</p>
        )}
        {rebinds.data?.items.map((r: any) => (
          <div className="list-row" key={r.id}>
            <div>
              <strong>
                {r.name} · {r.company}
              </strong>
              <p>{r.reason}</p>
            </div>
            <button
              onClick={() =>
                void act(() => api(`/owner/rebinds/${r.id}/approve`, {}))
              }
            >
              {t("موافقة")}
            </button>
          </div>
        ))}
        {rebinds.data && !rebinds.error && !rebinds.data.items.length && (
          <Empty />
        )}
      </section>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppUpdate />
    <App />
  </StrictMode>,
);
