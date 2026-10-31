import { useEffect, useState, type ReactNode } from "react";
import { api } from "./lib";
import { t } from "./i18n";
import { companyDate } from "../../packages/domain/company-date";
const weekdays = [
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
  "الأحد",
];
function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="schedule-field">
      <span>{name}</span>
      {children}
    </label>
  );
}
function useLoad(path: string, revision: number) {
  const [result, setResult] = useState<{
    path: string;
    data?: any;
    error?: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    setResult(null);
    api(path)
      .then((data) => active && setResult({ path, data }))
      .catch((e) => active && setResult({ path, error: e.message }));
    return () => {
      active = false;
    };
  }, [path, revision]);
  return result?.path === path ? result : null;
}
const clock = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export default function Schedule({ me }: { me: any }) {
  const manager = me.member.role !== "worker";
  const [revision, setRevision] = useState(0),
    [member, setMember] = useState(me.member.id),
    [date, setDate] = useState(companyDate(me.company.timezone));
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const people = useLoad("/members", revision);
  const result = useLoad(`/members/${member}/work-plan?date=${date}`, revision);
  async function save(fn: () => Promise<any>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
      setMessage(t("تم الحفظ"));
      setRevision((v) => v + 1);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const selected = people?.data?.items.find((m: any) => m.id === member);
  const editable =
    manager && (me.member.role !== "manager" || selected?.role === "worker");
  return (
    <div className="schedule-layout">
      <section className="card padded">
        <h2>{t("جدول الدوام")}</h2>
        <p>
          {t("المنطقة الزمنية")}: <bdi>{me.company.timezone}</bdi>
        </p>
        {manager && (
          <Field name={t("العامل")}>
            <select
              value={member}
              disabled={busy || !people?.data}
              onChange={(e) => setMember(e.target.value)}
            >
              {people?.data?.items
                .filter((m: any) => m.status === "active")
                .map((m: any) => (
                  <option value={m.id} key={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {people?.error && (
          <p className="error" role="alert">
            {people.error}
          </p>
        )}
        <Field name={t("عرض الخطة بتاريخ")}>
          <input
            type="date"
            required
            value={date}
            disabled={busy}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </Field>
        <p role="status">{message}</p>
        {!result && <p role="status">{t("عم نحمّل جدول الدوام…")}</p>}
        {result?.error && (
          <p className="error" role="alert">
            {result.error}
          </p>
        )}
        {result?.data && (
          <>
            <PlanSummary record={result.data.plan} />
            <WorkdaySummary
              key={`${member}:${date}`}
              member={member}
              date={date}
              revision={revision}
            />
            {result.data.shiftWindow?.status === "resolved" && (
              <p>
                {t("مدة الشفت الفعلية بتاريخ العرض بالدقائق")}:{" "}
                {result.data.shiftWindow.elapsedMinutes}
              </p>
            )}
            {result.data.shiftWindow?.status === "needs_review" && (
              <p className="error" role="alert">
                {t(
                  "وقت الشفت مكرر أو غير موجود بسبب تغيير التوقيت. يلزم مراجعة وقته قبل حساب الساعات.",
                )}
              </p>
            )}
            {editable && (
              <PlanEditor
                key={`${member}:${date}:${revision}`}
                member={member}
                date={date}
                today={companyDate(me.company.timezone)}
                data={result.data}
                busy={busy}
                save={save}
              />
            )}
          </>
        )}
      </section>
      {manager && (
        <Templates revision={revision} busy={busy} save={save} me={me} />
      )}
    </div>
  );
}
function PlanSummary({ record }: { record: any }) {
  if (!record) return <p>{t("ما في خطة سارية بهالتاريخ")}</p>;
  const plan = record.plan,
    schedule = plan.schedule;
  return (
    <div>
      <p>
        {t("سارية من")}: <bdi>{record.effective_from}</bdi> ·{" "}
        <bdi>{record.timezone}</bdi>
      </p>
      {schedule.mode === "fixed" ? (
        <ul className="schedule-week">
          {schedule.days.map((day: any, i: number) => (
            <li key={i}>
              <strong>{t(weekdays[i])}</strong>
              <span>
                {day ? (
                  <>
                    {day.name} ·{" "}
                    <bdi>
                      {day.start}–{day.end}
                    </bdi>
                    {day.end < day.start && <> · {t("ينتهي باليوم التالي")}</>}
                  </>
                ) : (
                  t("عطلة")
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {t(
            schedule.period === "daily"
              ? "هدف يومي بالدقائق"
              : "هدف أسبوعي بالدقائق",
          )}
          : {schedule.minutes}
          <br />
          {schedule.days.map((d: number) => t(weekdays[d])).join("، ")}
        </p>
      )}
      <p>
        {t("الاستراحة بالدقائق")}: {plan.breakPolicy.deductionMinutes} ·{" "}
        {t("بعد تجاوز دقائق العمل")}: {plan.breakPolicy.thresholdMinutes}
      </p>
    </div>
  );
}
function PlanEditor({
  member,
  date,
  today,
  data,
  busy,
  save,
}: {
  member: string;
  date: string;
  today: string;
  data: any;
  busy: boolean;
  save: (fn: () => Promise<any>) => Promise<void>;
}) {
  const old = data.plan?.plan;
  const [mode, setMode] = useState(old?.schedule.mode ?? "fixed");
  const templates = useLoad("/shifts", 0);
  return (
    <details>
      <summary>{t("تعيين خطة جديدة")}</summary>
      <p>{t("الحفظ يبدأ من يوم قادم ولا يغيّر الأيام السابقة")}</p>
      <form
        className="schedule-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const days = weekdays
            .map((_, i) => (f.has(`day${i}`) ? i : -1))
            .filter((i) => i >= 0);
          const schedule =
            mode === "fixed"
              ? {
                  mode,
                  days: weekdays.map((_, i) =>
                    f.has(`day${i}`)
                      ? {
                          name: String(f.get(`name${i}`)),
                          start: String(f.get(`start${i}`)),
                          end: String(f.get(`end${i}`)),
                        }
                      : null,
                  ),
                }
              : {
                  mode,
                  period: f.get("period"),
                  minutes: Number(f.get("target")),
                  days,
                };
          void save(() =>
            api(`/members/${member}/work-plan`, {
              effectiveFrom: f.get("effective"),
              expectedVersion: data.latestVersion,
              reason: f.get("reason"),
              plan: {
                schedule,
                breakPolicy: {
                  thresholdMinutes: Number(f.get("threshold")),
                  deductionMinutes: Number(f.get("deduction")),
                },
                cutoff: f.get("cutoff"),
              },
            }),
          );
        }}
      >
        <fieldset disabled={busy}>
          <Field name={t("تاريخ بدء الخطة")}>
            <input
              name="effective"
              type="date"
              required
              min={nextDate(today)}
              defaultValue={date > today ? date : nextDate(today)}
            />
          </Field>
          <Field name={t("نظام الدوام")}>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="fixed">{t("أوقات ثابتة")}</option>
              <option value="target">{t("هدف ساعات")}</option>
            </select>
          </Field>
          {mode === "target" && (
            <>
              <Field name={t("فترة الهدف")}>
                <select
                  name="period"
                  defaultValue={old?.schedule.period ?? "daily"}
                >
                  <option value="daily">{t("يومي")}</option>
                  <option value="weekly">{t("أسبوعي")}</option>
                </select>
              </Field>
              <Field name={t("الهدف بالدقائق")}>
                <input
                  name="target"
                  type="number"
                  min="1"
                  max="10080"
                  required
                  defaultValue={old?.schedule.minutes ?? 480}
                />
              </Field>
            </>
          )}
          {templates?.error && <p className="error">{templates.error}</p>}
          {weekdays.map((day, i) => (
            <Day
              key={`${mode}:${i}`}
              day={day}
              index={i}
              fixed={mode === "fixed"}
              initial={
                old?.schedule.mode === "fixed"
                  ? old.schedule.days[i]
                  : undefined
              }
              enabled={
                old?.schedule.mode === "target"
                  ? old.schedule.days.includes(i)
                  : old?.schedule.mode === "fixed"
                    ? !!old.schedule.days[i]
                    : i !== 4
              }
              templates={templates?.data?.items ?? []}
            />
          ))}
          <Field name={t("الاستراحة بالدقائق")}>
            <input
              name="deduction"
              type="number"
              min="0"
              max="1440"
              required
              defaultValue={old?.breakPolicy.deductionMinutes ?? 0}
            />
          </Field>
          <Field name={t("بعد تجاوز دقائق العمل")}>
            <input
              name="threshold"
              type="number"
              min="0"
              max="1440"
              required
              defaultValue={old?.breakPolicy.thresholdMinutes ?? 360}
            />
          </Field>
          <Field name={t("حد اليوم الليلي")}>
            <input
              name="cutoff"
              type="time"
              required
              defaultValue={old?.cutoff ?? "04:00"}
            />
          </Field>
          <Field name={t("سبب التغيير")}>
            <input name="reason" minLength={3} maxLength={500} required />
          </Field>
          <button>{t("حفظ خطة العامل")}</button>
        </fieldset>
      </form>
    </details>
  );
}
function nextDate(date: string) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function Day({
  day,
  index,
  fixed,
  initial,
  enabled,
  templates,
}: {
  day: string;
  index: number;
  fixed: boolean;
  initial: any;
  enabled: boolean;
  templates: any[];
}) {
  const [on, setOn] = useState(enabled),
    [name, setName] = useState(initial?.name ?? ""),
    [start, setStart] = useState(initial?.start ?? "08:00"),
    [end, setEnd] = useState(initial?.end ?? "16:00");
  return (
    <div className="schedule-day">
      <label>
        <input
          type="checkbox"
          name={`day${index}`}
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
        />
        {t(day)}
      </label>
      {fixed && on && (
        <>
          <Field name={t("نسخ من قالب")}>
            <select
              value=""
              onChange={(e) => {
                const s = templates.find((x) => x.id === e.target.value);
                if (s) {
                  setName(s.name);
                  setStart(clock(s.start_minute));
                  setEnd(clock(s.end_minute));
                }
              }}
            >
              <option value="">{t("أوقات خاصة")}</option>
              {templates
                .filter((s) => !s.archived)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field name={t("اسم الشفت")}>
            <input
              name={`name${index}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
            />
          </Field>
          <Field name={t("بداية الشفت")}>
            <input
              type="time"
              name={`start${index}`}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </Field>
          <Field name={t("نهاية الشفت")}>
            <input
              type="time"
              name={`end${index}`}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              required
            />
          </Field>
        </>
      )}
    </div>
  );
}
function Templates({
  revision,
  busy,
  save,
  me,
}: {
  revision: number;
  busy: boolean;
  save: (fn: () => Promise<any>) => Promise<void>;
  me: any;
}) {
  const result = useLoad("/shifts", revision);
  return (
    <section className="card padded">
      <h2>{t("قوالب الشفتات")}</h2>
      {!result && <p role="status">{t("عم نحمّل جدول الدوام…")}</p>}
      {result?.error && (
        <p className="error" role="alert">
          {result.error}
        </p>
      )}
      {result?.data?.items.map((s: any) => (
        <details key={`${s.id}:${s.version}`}>
          <summary>
            {s.name} ·{" "}
            <bdi>
              {clock(s.start_minute)}–{clock(s.end_minute)}
            </bdi>
            {s.archived ? ` · ${t("مؤرشف")}` : ""}
          </summary>
          {(me.member.role !== "manager" || s.actor === me.member.id) && (
            <TemplateForm existing={s} busy={busy} save={save} />
          )}
        </details>
      ))}
      <h3>{t("إضافة شفت")}</h3>
      <TemplateForm key={revision} busy={busy} save={save} />
    </section>
  );
}
function TemplateForm({
  existing,
  busy,
  save,
}: {
  existing?: any;
  busy: boolean;
  save: (fn: () => Promise<any>) => Promise<void>;
}) {
  return (
    <form
      className="schedule-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body = {
          shift: {
            name: f.get("name"),
            start: f.get("start"),
            end: f.get("end"),
          },
          reason: f.get("reason"),
          ...(existing
            ? { expectedVersion: existing.version, archived: f.has("archived") }
            : {}),
        };
        void save(() =>
          api(
            existing ? `/shifts/${existing.template_id}` : "/shifts",
            body,
            existing ? "PUT" : "POST",
          ),
        );
      }}
    >
      <fieldset disabled={busy}>
        <Field name={t("اسم الشفت")}>
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={existing?.name}
          />
        </Field>
        <Field name={t("بداية الشفت")}>
          <input
            name="start"
            type="time"
            required
            defaultValue={existing ? clock(existing.start_minute) : "08:00"}
          />
        </Field>
        <Field name={t("نهاية الشفت")}>
          <input
            name="end"
            type="time"
            required
            defaultValue={existing ? clock(existing.end_minute) : "16:00"}
          />
        </Field>
        {existing && (
          <label>
            <input
              type="checkbox"
              name="archived"
              defaultChecked={!!existing.archived}
            />
            {t("أرشفة القالب")}
          </label>
        )}
        <Field name={t("سبب التغيير")}>
          <input name="reason" minLength={3} maxLength={500} required />
        </Field>
        <button>{t("حفظ الشفت")}</button>
      </fieldset>
    </form>
  );
}

function WorkdaySummary({
  member,
  date,
  revision,
}: {
  member: string;
  date: string;
  revision: number;
}) {
  const result = useLoad(
    `/members/${member}/workday-summary?date=${date}`,
    revision,
  );
  if (!result) return <p role="status">{t("عم نحسب ساعات اليوم…")}</p>;
  if (result.error)
    return (
      <p className="error" role="alert">
        {result.error}
      </p>
    );
  const data = result.data;
  if (data.status !== "ok")
    return (
      <p>
        {t("ملخص الساعات متاح حالياً للأيام ذات الشفت المحدد والواضح فقط.")}
      </p>
    );
  const duration = (ms: number) =>
    `${Math.floor(ms / 3600000)}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}`;
  return (
    <section aria-label={t("ملخص ساعات اليوم")}>
      <h3>{t("ملخص ساعات اليوم")}</h3>
      <p>{t("حساب أولي للجلسات المغلقة، وليس كشف ساعات معتمداً.")}</p>
      <ul className="schedule-week">
        <li>
          {t("الوقت المحتسب قبل الاستراحة")}
          <bdi>{duration(data.total.grossMs)}</bdi>
        </li>
        <li>
          {t("الاستراحة")}
          <bdi>{duration(data.total.breakMs)}</bdi>
        </li>
        <li>
          {t("صافي الوقت المحتسب")}
          <bdi>{duration(data.total.netMs)}</bdi>
        </li>
      </ul>
      {!data.complete && (
        <p role="status">
          {t(
            "الحساب غير مكتمل: اليوم لم ينتهِ أو توجد جلسات مفتوحة أو أحداث تحتاج مراجعة.",
          )}
        </p>
      )}
      {data.openCount > 0 && (
        <p>
          {t("جلسات مفتوحة غير محتسبة")}: {data.openCount}
        </p>
      )}
      {data.pendingCount > 0 && (
        <p>
          {t("أحداث حضور معلقة للمراجعة في هذا الحساب")}: {data.pendingCount}
        </p>
      )}
      {data.review.length > 0 && (
        <ul>
          {data.review.map((r: any) => (
            <li key={r.id}>
              {r.reason === "early_arrival" ? (
                <>
                  {t("وقت مبكر بانتظار مراجعة المدير")}:{" "}
                  <bdi>{duration(r.earlyMs)}</bdi>
                </>
              ) : (
                t("جلسة لا يمكن نسبتها للشفت تلقائياً؛ تحتاج مراجعة.")
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
