import {
  StrictMode,
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
  deviceId,
  localDB,
  syncQueue,
  currencies,
  type Operation,
} from "./lib";
import "./style.css";
const MapView = lazy(() => import("./Map"));
const roles: Record<string, string> = {
  gm: "مدير عام",
  am: "مدير مساعد",
  manager: "مدير فرع / قسم",
  worker: "عامل",
};
const time = (v: number) =>
  v
    ? new Intl.DateTimeFormat("ar-u-nu-latn", {
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
function Empty({ text = "ما في سجلات لسا." }: { text?: string }) {
  return (
    <div className="empty">
      <Clock3 size={30} />
      <p>{text}</p>
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span>
        <Check strokeWidth={3} size={27} />
      </span>
      <b>دوامي</b>
      <small>DAWAMI</small>
    </div>
  );
}
function useData(path: string, revision = 0) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setError("");
    api(path)
      .then((x) => alive && setData(x))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [path, revision]);
  return { data, error };
}
function CurrencySelect({ value = "SYP" }: { value?: string }) {
  return (
    <select name="currency" defaultValue={value}>
      {currencies.map((x) => (
        <option key={x} value={x}>
          {x} — {new Intl.DisplayNames(["ar"], { type: "currency" }).of(x)}
        </option>
      ))}
    </select>
  );
}
function Auth({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [signup, setSignup] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [local, setLocal] = useState(false);
  return (
    <div className="auth">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="pill">وقت أقل بالإدارة، وقت أكثر للشغل</span>
          <h1>
            يوم شغل واضح.
            <br />
            وفريق على نفس الصفحة.
          </h1>
          <p>
            الحضور، الفريق، والفروع — بمكان واحد،
            <br />
            مصمّم ليكون بسيط من أول يوم.
          </p>
          <div className="story-card">
            <Check />
            <div>
              <strong>كل حضور إلو مكان ووقت</strong>
              <p>تسجيل آمن ضمن نطاق الفرع</p>
            </div>
            <ShieldCheck />
          </div>
        </div>
        <small>دوامي · نظام الحضور وإدارة الفريق</small>
      </section>
      <section className="auth-card">
        <div className="eyebrow">أهلاً فيك بدوامي</div>
        <h2>{signup ? "خلّينا نرتّب يوم شركتك" : "منوّر من جديد"}</h2>
        <p>
          {signup
            ? "أنشئ شركتك وابدأ التجربة المجانية."
            : "سجّل دخول وتابع يومك."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
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
                    ? { companyId: f.get("companyId") }
                    : {}),
              });
              await onSuccess();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {signup && (
            <>
              <Field label="اسم الشركة">
                <input name="company" required minLength={2} />
              </Field>
              <Field label="اسمك الكامل">
                <input name="name" required minLength={2} />
              </Field>
              <Field label="عملة الشركة">
                <CurrencySelect />
              </Field>
            </>
          )}
          <Field label="رقم الموبايل مع رمز البلد">
            <input
              name="phone"
              type="tel"
              dir="ltr"
              placeholder="+963 9xx xxx xxx"
              required
              autoComplete="tel"
            />
          </Field>
          <Field label="كلمة السر / PIN">
            <input
              name="pin"
              type="password"
              minLength={signup ? 8 : 1}
              required
              autoComplete={signup ? "new-password" : "current-password"}
            />
          </Field>
          {local && !signup && (
            <Field label="رمز الشركة من المدير">
              <input name="companyId" dir="ltr" required />
            </Field>
          )}
          <div role="alert" className="error">
            {error}
          </div>
          <button disabled={busy} className="wide">
            {busy ? "عم نتحقق…" : signup ? "إنشاء الشركة" : "تسجيل الدخول"}
            <ArrowUpLeft size={19} />
          </button>
        </form>
        {!signup && (
          <button className="text-button" onClick={() => setLocal(!local)}>
            {local ? "الدخول بالهوية العامة" : "عندي PIN مؤقت من المدير"}
          </button>
        )}
        <div className="auth-switch">
          {signup ? "عندك حساب؟" : "أول مرة هون؟"}{" "}
          <button
            onClick={() => {
              setSignup(!signup);
              setError("");
            }}
          >
            {signup ? "سجّل دخول" : "أنشئ شركتك"}
          </button>
        </div>
        <p className="fine-print">
          نسيت PIN؟ مديرك المسؤول بيساعدك باستعادته.
          <br />
          ما في دفع داخل التطبيق.
        </p>
      </section>
    </div>
  );
}
function App() {
  const [me, setMe] = useState<any>(null),
    [ready, setReady] = useState(false),
    [view, setView] = useState(
      new URLSearchParams(location.search).get("view") === "location"
        ? "notifications"
        : "dashboard",
    ),
    [revision, setRevision] = useState(0),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [dark, setDark] = useState(localStorage.getItem("theme") === "dark");
  const refresh = useCallback(async () => {
    try {
      const x = await api("/auth/me");
      setCsrf(x.csrf);
      setMe(x);
      if (!x.owner && x.member && !x.mustChange) {
        const { csrf, memberships, ...snapshot } = x;
        sessionStorage.setItem(
          "dawami-offline-profile",
          JSON.stringify({ ...snapshot, memberships: [] }),
        );
      } else sessionStorage.removeItem("dawami-offline-profile");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setMe(null);
        sessionStorage.removeItem("dawami-offline-profile");
      } else if (!navigator.onLine) {
        try {
          const snapshot = JSON.parse(
            sessionStorage.getItem("dawami-offline-profile") || "null",
          );
          if (snapshot?.expires > Date.now() && snapshot.deviceBound) {
            setMe(snapshot);
            setView("attendance");
            setMessage(
              "أنت أوفلاين. الحضور محفوظ محلياً وبانتظار تحقق الخادم.",
            );
          } else setMessage("اتصل بالإنترنت لتجديد جلسة الدخول.");
        } catch {
          sessionStorage.removeItem("dawami-offline-profile");
        }
      } else setMessage((e as Error).message);
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
  const act: Action = async (fn, success = "تم الحفظ") => {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage(success);
      setRevision((x) => x + 1);
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!ready) return <div className="loading">عم نجهّز يومك…</div>;
  if (!me) return <Auth onSuccess={refresh} />;
  if (me.mustChange)
    return (
      <div className="auth simple">
        <section className="auth-card">
          <Brand />
          <h1>خلّي حسابك إلك</h1>
          <p>غيّر PIN المؤقت قبل المتابعة.</p>
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
            <Field label="PIN الحالي">
              <input
                name="current"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
            <Field label="PIN الجديد (8 محارف على الأقل)">
              <input
                name="next"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </Field>
            <button disabled={busy}>حفظ ومتابعة</button>
          </form>
          <p role="status">{message}</p>
        </section>
      </div>
    );
  if (!me.owner && !me.member)
    return (
      <div className="auth simple">
        <section className="auth-card">
          <Brand />
          <h1>اختار شركتك</h1>
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
                    { membershipId: m.id },
                  ),
                )
              }
            >
              {m.name}
              <span>{m.status === "invited" ? "قبول الدعوة" : "دخول"} ←</span>
            </button>
          ))}
          <p role="status">{message}</p>
          <button
            className="ghost"
            onClick={() => void act(() => api("/auth/logout"))}
          >
            تسجيل خروج
          </button>
        </section>
      </div>
    );
  if (me.locked)
    return (
      <div className="auth simple">
        <section className="auth-card">
          <ShieldCheck size={44} />
          <h1>منكمّل بعد التجديد</h1>
          <p>
            انتهى اشتراك {me.company.name} أو تم إيقافه. الدفع خارج التطبيق؛
            تواصل مع مالك دوامي لتفعيل الاشتراك.
          </p>
          <button onClick={() => void refresh()}>تحقق من التفعيل</button>
          <button
            className="ghost"
            onClick={() => void act(() => api("/auth/logout"))}
          >
            تسجيل خروج
          </button>
        </section>
      </div>
    );
  const manager = me.owner || me.member.role !== "worker",
    nav: any[] = me.owner
      ? [
          ["owner", "الشركات", Building2],
          ["ownerSettings", "إعدادات المنصة", Settings],
          ["ownerRecovery", "استعادة الحسابات", ShieldCheck],
        ]
      : [
          ["dashboard", "نظرة عامة", LayoutDashboard],
          ["attendance", "حضوري", Clock3],
          ...(manager
            ? [
                ["members", "فريق العمل", Users],
                ["branches", "الفروع والأقسام", MapPin],
                ["devices", "طلبات الأجهزة", ShieldCheck],
              ]
            : []),
          ["notifications", "الإشعارات", Bell],
          ...(["gm", "am"].includes(me.member.role)
            ? [["settings", "إعدادات الشركة", Settings]]
            : []),
          ...(me.member.role === "gm"
            ? [["audit", "سجل الرقابة", ShieldCheck]]
            : []),
        ],
    actualView = me.owner && view === "dashboard" ? "owner" : view;
  return (
    <div className="app">
      <a className="skip" href="#main">
        انتقل للمحتوى
      </a>
      <aside>
        <Brand />
        <div className="workspace">
          <Building2 size={23} />
          <div>
            <strong>{me.owner ? "إدارة المنصة" : me.company.name}</strong>
            <small>{me.owner ? "مالك دوامي" : roles[me.member.role]}</small>
          </div>
        </div>
        {!me.owner && me.mode === "global" && me.memberships.length > 1 && (
          <label className="workspace-switch">
            الشركة
            <select
              aria-label="تبديل الشركة"
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
                    { membershipId: selected.id },
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
                    {m.status === "invited" ? " — قبول الدعوة" : ""}
                  </option>
                ))}
            </select>
          </label>
        )}
        <span className="nav-caption">مساحة العمل</span>
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
            <span>كل يوم، أوضح.</span>
            <p>حضور فريقك بمكان واحد.</p>
          </div>
          <small>دوامي · المرحلة الأولى</small>
        </div>
      </aside>
      <div className="body">
        <header>
          <div className="breadcrumb">
            مساحة العمل <ChevronLeft size={15} />
            <strong>{nav.find((x) => x[0] === actualView)?.[1]}</strong>
          </div>
          <div className="header-actions">
            <span className={online ? "connection" : "connection offline"}>
              {online ? <span className="dot" /> : <WifiOff size={14} />}{" "}
              {online ? "متصل" : "بدون اتصال"}
            </span>
            <button
              className="icon"
              aria-label="تبديل الوضع الداكن"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              className="icon"
              aria-label="تسجيل خروج"
              onClick={() => void act(() => api("/auth/logout"))}
            >
              <LogOut size={18} />
            </button>
            <span className="avatar">{me.name[0]}</span>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {new Intl.DateTimeFormat("ar-u-nu-latn", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }).format(new Date())}
              </div>
              <h1>
                {actualView === "dashboard"
                  ? `صباح الشغل الحلو، ${me.name.split(" ")[0]}`
                  : nav.find((x) => x[0] === actualView)?.[1]}
              </h1>
              <p>
                {actualView === "dashboard"
                  ? "كل اللي بدك تعرفه عن فريقك اليوم."
                  : "تفاصيل واضحة، وقرارات بإيدك."}
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
              <RefreshCw size={16} /> تحديث
            </button>
          </div>
          {message && (
            <div className="notice" role="status">
              {message}
              <button aria-label="إغلاق الرسالة" onClick={() => setMessage("")}>
                ×
              </button>
            </div>
          )}
          {me.mode === "local" && (
            <div className="notice">
              هذا الدخول خاص بشركة {me.company.name} فقط.
            </div>
          )}
          {actualView === "dashboard" && (
            <Dashboard me={me} revision={revision} setView={setView} />
          )}
          {actualView === "attendance" && (
            <Attendance me={me} revision={revision} act={act} busy={busy} />
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
          دوامي — يومك منظّم، وفريقك أقرب.<span>حضور · فريق · وضوح</span>
        </footer>
      </div>
    </div>
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
  if (!data) return <Empty text="عم نحمّل ملخص اليوم…" />;
  return (
    <>
      <div className="stats">
        <Stat
          label="الحاضرون الآن"
          value={data.present}
          suffix={`/ ${data.total}`}
          icon={<Users />}
          color="green"
        />
        <Stat
          label="نسبة الحضور الآن"
          value={data.total ? Math.round((data.present / data.total) * 100) : 0}
          suffix="%"
          icon={<Check />}
          color="blue"
        />
        <Stat
          label="انصرفوا اليوم"
          value={data.left}
          icon={<ArrowUpLeft />}
          color="slate"
        />
        <Stat
          label="أفراد الفريق"
          value={data.total}
          icon={<Building2 />}
          color="violet"
        />
      </div>
      <div className="dashboard-grid">
        <section className="card">
          <div className="card-title">
            <div>
              <h2>فريقك اليوم</h2>
              <p>آخر حالة حضور لكل فرد ضمن نطاقك</p>
            </div>
            <span className="badge green">مباشر</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>عضو الفريق</th>
                  <th>الفرع</th>
                  <th>الدخول</th>
                  <th>الحالة</th>
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
                    <td>{m.branch ?? "غير معيّن"}</td>
                    <td className="number">{m.today ? time(m.in_at) : "—"}</td>
                    <td>
                      <span
                        className={
                          "badge " +
                          (m.present ? "green" : m.today ? "slate" : "amber")
                        }
                      >
                        {m.present ? "بالشغل" : m.today ? "انصرف" : "ما بلّش"}
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
            <span>يومك إلو قيمة</span>
            <h2>جاهز تبلّش؟</h2>
            <p>
              سجّل حضورك من الفرع،
              <br />
              وخلّي دوامي يتابع الوقت.
            </p>
            <button onClick={() => setView("attendance")}>
              افتح حضوري <ArrowUpLeft size={18} />
            </button>
          </section>
          <section className="card compact">
            <span className="badge blue">
              {me.company.status === "trial" ? "فترة تجريبية" : "اشتراك فعّال"}
            </span>
            <h3>{me.company.name}</h3>
            <p>
              متاح حتى{" "}
              {new Date(me.company.ends_at).toLocaleDateString("ar-u-nu-latn")}
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
          {value}
          <small>{suffix}</small>
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
}: {
  me: any;
  revision: number;
  act: Action;
  busy: boolean;
}) {
  const { data, error } = useData("/attendance/mine", revision),
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
      .toArray()
      .then(setOps);
  }, [revision, me.member.id]);
  const open = data?.items.find((x: any) => !x.out_at);
  const perform = (action: "in" | "out") =>
    act(
      async () => {
        const gps = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(
            resolve,
            () => reject(new Error("اسمح بالوصول للموقع وجرّب مرة تانية")),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
          ),
        );
        const payload = {
          id: crypto.randomUUID(),
          action,
          deviceTime: Date.now(),
          lat: gps.coords.latitude,
          lng: gps.coords.longitude,
          accuracy: gps.coords.accuracy,
          offline: !navigator.onLine,
        };
        await localDB.operations.add({
          ...payload,
          companyId: me.member.company_id,
          membershipId: me.member.id,
          state: "pending",
        });
        if (navigator.onLine) {
          try {
            const r = await api("/attendance/punch", payload);
            await localDB.operations.update(payload.id, {
              state: r.status,
              message: r.reason,
            });
          } catch (e) {
            if (e instanceof ApiError) {
              await localDB.operations.update(payload.id, {
                state: "error",
                message: e.message,
              });
              throw e;
            }
            await localDB.operations.update(payload.id, { offline: true });
          }
        }
        navigator.vibrate?.(80);
      },
      navigator.onLine
        ? "تم إرسال عملية الحضور"
        : "انحفظت العملية بانتظار المزامنة",
    );
  return (
    <>
      <div className="two-col">
        <section className="card padded">
          <h2>حضوري اليوم</h2>
          <p>الموقع يُستخدم فقط وقت التسجيل.</p>
          <div className="timer" dir="ltr">
            {open
              ? new Date(now - open.in_at).toISOString().slice(11, 19)
              : "00:00:00"}
          </div>
          <p>{open ? "وقت الجلسة الحالية" : "ما عندك جلسة مفتوحة"}</p>
          {!me.deviceBound ? (
            <>
              <p>هذا الجهاز غير مربوط بعضويتك.</p>
              <button
                disabled={busy}
                onClick={() =>
                  void act(() => api("/device/bind", {}), "تم ربط الجهاز")
                }
              >
                ربط الجهاز لأول مرة
              </button>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act(
                    () => api("/device/rebind", { reason: f.get("reason") }),
                    "تم إرسال طلب إعادة الربط",
                  );
                }}
              >
                <Field label="سبب إعادة الربط">
                  <input name="reason" required minLength={3} />
                </Field>
                <button className="secondary" disabled={busy}>
                  طلب إعادة ربط
                </button>
              </form>
            </>
          ) : (
            <div className="punch-buttons">
              <button
                disabled={busy || !!open}
                onClick={() => void perform("in")}
              >
                تسجيل دخول
              </button>
              <button
                disabled={busy || !open}
                className="secondary"
                onClick={() => void perform("out")}
              >
                تسجيل خروج
              </button>
            </div>
          )}
          <p className="error">{error}</p>
        </section>
        <section className="card padded">
          <h2>حالة المزامنة</h2>
          <p>كل عملية مرتبطة بشركتك الحالية فقط.</p>
          {ops.length ? (
            ops
              .slice(-8)
              .reverse()
              .map((o) => (
                <div className="list-row" key={o.id}>
                  <div>
                    <strong>
                      {o.action === "in" ? "دخول" : "خروج"} ·{" "}
                      {time(o.deviceTime)}
                    </strong>
                    <small>{o.message}</small>
                  </div>
                  <span className="badge slate">
                    {
                      {
                        pending: "بانتظار المزامنة",
                        accepted: "مقبول",
                        review: "للمراجعة",
                        error: "تعذّر الاعتماد",
                      }[o.state]
                    }
                  </span>
                </div>
              ))
          ) : (
            <Empty text="كل شي محدّث" />
          )}
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              void act(
                () => syncQueue(me.member.company_id, me.member.id),
                "تمت محاولة المزامنة",
              )
            }
          >
            مزامنة الآن
          </button>
        </section>
      </div>
      <section className="card">
        <div className="card-title">
          <h2>جلساتي الأخيرة</h2>
        </div>
        {data?.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الفرع</th>
                  <th>الدخول</th>
                  <th>الخروج</th>
                  <th>المدة</th>
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
                      {Math.floor(((s.out_at ?? now) - s.in_at) / 60000)} دقيقة
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
    [selected, setSelected] = useState<any>(null);
  const manage = ["gm", "am"].includes(me.member.role);
  return (
    <>
      <div className="two-col">
        <section className="card padded">
          <h2>الفروع ونطاق الحضور</h2>
          {data?.items.map((b: any) => (
            <button
              className="choice"
              key={b.id}
              onClick={() => setSelected(b)}
            >
              <span>{b.name}</span>
              <span>{b.radius} م · عرض الموقع</span>
            </button>
          ))}
          {!data?.items.length && <Empty text="أضف أول فرع لتسجيل الحضور" />}
          {selected && (
            <Suspense fallback={<Empty text="عم نحمّل الخريطة…" />}>
              <MapView
                lat={selected.lat}
                lng={selected.lng}
                radius={selected.radius}
              />
            </Suspense>
          )}
        </section>
        {manage && (
          <section className="card padded">
            <h2>إضافة فرع</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(() =>
                  api("/branches", {
                    name: f.get("name"),
                    lat: Number(f.get("lat")),
                    lng: Number(f.get("lng")),
                    radius: Number(f.get("radius")),
                  }),
                );
              }}
            >
              <Field label="اسم الفرع">
                <input name="name" required minLength={2} />
              </Field>
              <div className="two-col">
                <Field label="خط العرض">
                  <input
                    name="lat"
                    type="number"
                    step="any"
                    min={-90}
                    max={90}
                    required
                    defaultValue="33.5138"
                  />
                </Field>
                <Field label="خط الطول">
                  <input
                    name="lng"
                    type="number"
                    step="any"
                    min={-180}
                    max={180}
                    required
                    defaultValue="36.2765"
                  />
                </Field>
              </div>
              <Field label="نطاق الحضور بالمتر">
                <input
                  name="radius"
                  type="number"
                  min={10}
                  max={10000}
                  defaultValue={150}
                  required
                />
              </Field>
              <button disabled={busy}>حفظ الفرع</button>
            </form>
          </section>
        )}
      </div>
      <section className="card padded">
        <h2>الأقسام</h2>
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
              void act(() => api("/departments", { name: f.get("name") }));
            }}
          >
            <Field label="اسم القسم الجديد">
              <input name="name" required minLength={2} />
            </Field>
            <button disabled={busy}>إضافة قسم</button>
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
  const canCreate = ["gm", "manager"].includes(me.member.role);
  return (
    <>
      <section className="card">
        <div className="card-title">
          <h2>فريق العمل</h2>
          <span className="badge blue">
            {members.data?.items.length ?? 0} عضو
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الاسم</th>
                <th>الهاتف</th>
                <th>الدور</th>
                <th>الفرع</th>
                <th>الحالة</th>
                <th>إدارة</th>
              </tr>
            </thead>
            <tbody>
              {members.data?.items.map((m: any) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td dir="ltr">{m.phone}</td>
                  <td>{roles[m.role]}</td>
                  <td>{m.branch ?? "غير معيّن"}</td>
                  <td>
                    <span className="badge slate">
                      {m.status === "invited"
                        ? "دعوة معلقة"
                        : m.bound
                          ? "جهاز مربوط"
                          : "بانتظار الربط"}
                    </span>
                  </td>
                  <td>
                    <button className="text-button" onClick={() => setReset(m)}>
                      إدارة
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {reset && (
        <section className="card padded">
          <h2>إدارة {reset.name}</h2>
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
                `أعط العامل رمز الشركة: ${me.company.id}`,
              );
            }}
          >
            <Field label="PIN مؤقت جديد">
              <input name="pin" type="password" minLength={8} required />
            </Field>
            <Field label="سبب إعادة التعيين">
              <input name="reason" minLength={3} required />
            </Field>
            <button disabled={busy}>إعادة تعيين ضمن هذه الشركة</button>
            <button
              type="button"
              className="ghost"
              onClick={() => setReset(null)}
            >
              إغلاق
            </button>
          </form>
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
              <h3>تعيين الفرع والقسم</h3>
              <Field label="الفرع">
                <select name="branchId" required>
                  {branches.data?.items.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="القسم">
                <select name="departmentId">
                  <option value="">بدون قسم</option>
                  {departments.data?.items.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="السبب">
                <input name="reason" required minLength={3} />
              </Field>
              <button disabled={busy}>حفظ التعيين</button>
            </form>
          )}
        </section>
      )}
      {canCreate && (
        <div className="two-col">
          <section className="card padded">
            <h2>إضافة عضو للفريق</h2>
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
                  "تم إنشاء العضوية؛ الهوية الموجودة تستقبل دعوة",
                );
              }}
            >
              <Field label="الاسم الكامل">
                <input name="name" minLength={2} required />
              </Field>
              <Field label="رقم الموبايل">
                <input
                  name="phone"
                  type="tel"
                  dir="ltr"
                  placeholder="+963…"
                  required
                />
              </Field>
              <Field label="PIN أولي للهوية الجديدة فقط">
                <input name="pin" type="password" minLength={8} required />
              </Field>
              <Field label="الدور">
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
              <Field label="الفرع">
                <select name="branchId" required>
                  {branches.data?.items.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="القسم">
                <select name="departmentId">
                  <option value="">بدون قسم</option>
                  {departments.data?.items.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button disabled={busy}>إضافة العضو</button>
            </form>
          </section>
          <section className="card padded">
            <h2>استيراد العمال من Excel</h2>
            <p>
              الأعمدة: الاسم، الهاتف، الفرع، القسم. راجع المعاينة قبل الحفظ.
              الحساب الموجود عالمياً تصله دعوة.
            </p>
            <input
              aria-label="ملف Excel"
              type="file"
              accept=".xlsx"
              onChange={async (e) => {
                setImportError("");
                try {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 2_000_000)
                    throw new Error("الملف أكبر من 2 ميغابايت");
                  const { readSheet: readXlsxFile } =
                    await import("read-excel-file/browser");
                  const all = await readXlsxFile(file);
                  if (all.length > 201) throw new Error("حتى 200 عامل لكل ملف");
                  if (
                    all[0]?.slice(0, 4).join("|") !== "الاسم|الهاتف|الفرع|القسم"
                  )
                    throw new Error(
                      "رتّب الأعمدة: الاسم، الهاتف، الفرع، القسم",
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
                        ? "الهاتف غير صحيح"
                        : seen.has(phone) ||
                            members.data?.items.some(
                              (m: any) => m.phone === phone,
                            )
                          ? "رقم مكرر"
                          : !branch
                            ? "الفرع غير معروف"
                            : row[3] && !department
                              ? "القسم غير معروف"
                              : String(row[0] ?? "").length < 2
                                ? "الاسم غير صحيح"
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
                    {r.phone} · {r.error || (r.saved ? "تمت الإضافة" : "جاهز")}
                  </small>
                </div>
                <span>{r.saved ? "✓" : ""}</span>
              </div>
            ))}
            {rows.length > 0 && (
              <>
                <p>
                  احفظ بيانات PIN المؤقتة بعد الإضافة لتسليمها للعامل بأمان. لا
                  تُرسل عبر إشعارات.
                </p>
                <button
                  disabled={busy || rows.some((r) => r.error)}
                  onClick={() =>
                    void act(async () => {
                      for (let i = 0; i < rows.length; i++) {
                        if (rows[i].saved) continue;
                        await api("/members", { ...rows[i], role: "worker" });
                        rows[i].saved = true;
                        setRows([...rows]);
                      }
                    }, "تم الاستيراد")
                  }
                >
                  اعتماد الاستيراد
                </button>
                <details>
                  <summary>PIN المؤقت لكل صف</summary>
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
      <h2>إعدادات شركتك</h2>
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
        <Field label="اسم الشركة">
          <input
            name="name"
            defaultValue={me.company.name}
            required
            minLength={2}
          />
        </Field>
        <Field label="العملة">
          <CurrencySelect value={me.company.currency} />
        </Field>
        <Field label="المنطقة الزمنية">
          <input name="timezone" defaultValue={me.company.timezone} required />
        </Field>
        <Field label="مدة الجلسة بالأيام">
          <input
            name="sessionDays"
            type="number"
            min={1}
            max={30}
            defaultValue={me.company.session_days}
          />
        </Field>
        <Field label="أعلى خطأ مسموح لدقة GPS بالمتر">
          <input
            name="gpsAccuracy"
            type="number"
            min={10}
            max={500}
            defaultValue={me.company.gps_accuracy}
          />
        </Field>
        <button disabled={busy}>حفظ الإعدادات</button>
      </form>
      <small>رمز الشركة للدخول المؤقت:</small>
      <p dir="ltr">
        <code>{me.company.id}</code>
      </p>
    </section>
  );
}
function Notifications({ revision, act }: { revision: number; act: Action }) {
  const { data, error } = useData("/notifications", revision),
    [location, setLocation] = useState<{ lat: number; lng: number } | null>(
      null,
    );
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("view") === "location") {
      const lat = Number(params.get("lat")),
        lng = Number(params.get("lng"));
      if (Number.isFinite(lat) && Number.isFinite(lng))
        setLocation({ lat, lng });
    }
  }, []);
  return (
    <section className="card padded">
      <div className="card-title">
        <h2>مركز الإشعارات</h2>
        <button
          className="secondary"
          onClick={() =>
            void act(async () => {
              if (!("serviceWorker" in navigator) || !("PushManager" in window))
                throw new Error(
                  "هالمتصفح لا يدعم الإشعارات. على iPhone أضف التطبيق للشاشة الرئيسية",
                );
              const config = await api("/public/config");
              if (!config.vapidPublicKey)
                throw new Error("مفاتيح push لم تُجهز على الخادم بعد");
              const registration = await navigator.serviceWorker.ready;
              const raw = atob(
                config.vapidPublicKey.replace(/-/g, "+").replace(/_/g, "/"),
              );
              const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
              const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: key,
              });
              await api("/push/subscribe", subscription.toJSON());
            }, "تم تفعيل الإشعارات")
          }
        >
          تفعيل إشعارات الجهاز
        </button>
      </div>
      <p className="error">{error}</p>
      {location && (
        <Suspense fallback={<Empty />}>
          <MapView {...location} />
        </Suspense>
      )}
      {data?.items.length ? (
        data.items.map((n: any) => (
          <button
            className="notification"
            key={n.id}
            onClick={() =>
              void act(async () => {
                await api(`/notifications/${n.id}/read`, {});
                const p = new URL(n.url, window.location.origin).searchParams;
                if (p.has("lat"))
                  setLocation({
                    lat: Number(p.get("lat")),
                    lng: Number(p.get("lng")),
                  });
              }, "تمت قراءة الإشعار")
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
      ) : (
        <Empty text="الإشعارات الجديدة بتظهر هون" />
      )}
    </section>
  );
}
function Devices({ revision, act }: { revision: number; act: Action }) {
  const { data, error } = useData("/device/requests", revision);
  return (
    <section className="card padded">
      <h2>طلبات إعادة ربط الأجهزة</h2>
      <p className="error">{error}</p>
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
              موافقة
            </button>
          </div>
        ))
      ) : (
        <Empty />
      )}
    </section>
  );
}
function Audit({ revision }: { revision: number }) {
  const { data, error } = useData("/audit", revision);
  return (
    <section className="card">
      <div className="card-title">
        <h2>سجل الرقابة</h2>
        <span className="badge blue">قراءة فقط · المدير العام</span>
      </div>
      <p className="error">{error}</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الوقت</th>
              <th>العملية</th>
              <th>الفاعل</th>
              <th>السبب</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((a: any) => (
              <tr key={a.id}>
                <td>{new Date(a.created_at).toLocaleString("ar-u-nu-latn")}</td>
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
  return (
    <>
      <div className="stats">
        <Stat
          label="الشركات"
          value={data?.items.length ?? 0}
          icon={<Building2 />}
          color="blue"
        />
        <Stat
          label="بالتجربة"
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
          <h2>دليل الشركات</h2>
          <small>التفعيل بعد الدفع خارج التطبيق</small>
        </div>
        <p className="error">{error}</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>الشركة</th>
                <th>العمال</th>
                <th>الحالة</th>
                <th>نهاية الاشتراك</th>
                <th>إدارة الاشتراك</th>
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
                        ? "موقوف"
                        : co.ends_at < Date.now()
                          ? "منتهي"
                          : co.status === "trial"
                            ? "تجريبي"
                            : "فعال"}
                    </span>
                  </td>
                  <td>
                    {new Date(co.ends_at).toLocaleDateString("ar-u-nu-latn")}
                  </td>
                  <td>
                    <div className="actions">
                      {[
                        ["month", "شهر"],
                        ["year", "سنة"],
                        ["trial", "تجربة"],
                        ["suspend", "إيقاف"],
                      ].map(([action, label]) => (
                        <button
                          className="secondary"
                          key={action}
                          onClick={() => {
                            const reason = prompt(
                              "سبب التفعيل أو الإيقاف (للتدقيق)",
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
        {!data?.items.length && <Empty text="أول شركة بتسجّل رح تظهر هون" />}
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
  const { data } = useData("/owner/companies", revision);
  return (
    <section className="card padded narrow">
      <h2>التجربة والأسعار</h2>
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
          <Field label="مدة التجربة بالأيام">
            <input
              name="trialDays"
              type="number"
              min={1}
              max={365}
              defaultValue={data.settings?.trial_days ?? 14}
            />
          </Field>
          <Field label="السعر الشهري (بوحدة التسعير المتفق عليها)">
            <input
              name="monthly"
              type="number"
              min={0}
              defaultValue={data.settings?.monthly ?? 0}
            />
          </Field>
          <Field label="السعر السنوي">
            <input
              name="yearly"
              type="number"
              min={0}
              defaultValue={data.settings?.yearly ?? 0}
            />
          </Field>
          <button disabled={busy}>حفظ</button>
        </form>
      )}
      <p>الأسعار للتسجيل فقط؛ لا تحصيل إلكتروني.</p>
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
    [managers, setManagers] = useState<any[]>([]);
  return (
    <>
      <div className="two-col">
        <section className="card padded">
          <h2>استعادة دخول مدير عام ضمن شركته</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
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
            <Field label="الشركة">
              <select
                required
                value={companyId}
                onChange={(e) => {
                  setCompanyId(e.target.value);
                  api(`/owner/companies/${e.target.value}/managers`).then((x) =>
                    setManagers(x.items),
                  );
                }}
              >
                <option value="">اختار الشركة</option>
                {companies.data?.items.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="المدير">
              <select name="membershipId" required>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="PIN المؤقت">
              <input name="pin" type="password" minLength={8} required />
            </Field>
            <Field label="سبب التحقق وإعادة التعيين">
              <input name="reason" minLength={5} required />
            </Field>
            <button disabled={busy}>إعادة التعيين</button>
          </form>
          {companyId && <p dir="ltr">{companyId}</p>}
        </section>
        <section className="card padded">
          <h2>استعادة الهوية العامة</h2>
          <p>
            بعد التحقق اليدوي من صاحب الهوية. تؤثر على الدخول العام لكل الشركات.
            لا ترفع وثائق هوية.
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
            <Field label="رقم الهاتف">
              <input name="phone" type="tel" required dir="ltr" />
            </Field>
            <Field label="PIN المؤقت">
              <input name="pin" type="password" minLength={8} required />
            </Field>
            <Field label="كيف تحققت من الهوية؟">
              <textarea name="reason" minLength={10} required />
            </Field>
            <label className="check-label">
              <input type="checkbox" required />
              تحققت من صاحب الحساب شخصياً
            </label>
            <button disabled={busy}>استعادة الهوية وتسجيل العملية</button>
          </form>
        </section>
      </div>
      <section className="card padded">
        <h2>إعادة ربط أجهزة المدراء العامين</h2>
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
              موافقة
            </button>
          </div>
        ))}
        {!rebinds.data?.items.length && <Empty />}
      </section>
    </>
  );
}
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
