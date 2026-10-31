import { useEffect, useState, type ReactNode } from "react";
import { api } from "./lib";
import { t, locale } from "./i18n";
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
            {result.data.holiday && (
              <p>
                {t("عطلة رسمية")}: {result.data.holiday}
              </p>
            )}
            <PlanSummary record={result.data.plan} />
            <WorkdaySummary
              key={`${member}:${date}`}
              member={member}
              date={date}
              revision={revision}
              busy={busy}
              save={save}
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
                weekends={JSON.parse(me.company.weekend_days ?? "[4]")}
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
      {member === me.member.id && me.member.role === "gm" && (
        <p>{t("المدير العام لا يقدم طلبات وقت أو كشوف ساعات لنفسه")}</p>
      )}
      <TimeRequests
        key={`${member}:${date}:${revision}`}
        member={member}
        self={member === me.member.id && me.member.role !== "gm"}
        date={date}
        revision={revision}
        busy={busy}
        save={save}
      />
      <WeekSummary
        key={member}
        member={member}
        date={date}
        revision={revision}
        selectDate={setDate}
        busy={busy}
      />
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
  weekends,
  date,
  today,
  data,
  busy,
  save,
}: {
  member: string;
  weekends: number[];
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
                graceMinutes: Number(f.get("grace")),
                reminderGraceMinutes: Number(f.get("reminderGrace")),
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
                    : !weekends.includes(i)
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
          <Field name={t("مهلة تذكير مغادرة الفرع بالدقائق")}>
            <input
              name="reminderGrace"
              type="number"
              min="0"
              max="120"
              required
              defaultValue={old?.reminderGraceMinutes ?? 5}
            />
          </Field>
          <Field name={t("هامش التأخير بالدقائق")}>
            <input
              name="grace"
              type="number"
              min="0"
              max="240"
              required
              defaultValue={old?.graceMinutes ?? 10}
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
  busy,
  save,
}: {
  member: string;
  date: string;
  revision: number;
  busy: boolean;
  save: (fn: () => Promise<any>) => Promise<void>;
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
    return <p>{t("لا يمكن حساب ملخص لهذا اليوم بدون خطة واضحة.")}</p>;
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
      {data.requiredMs !== null && data.requiredMs !== undefined && (
        <p>
          {t("المطلوب")}: <bdi>{duration(data.requiredMs)}</bdi> ·{" "}
          {t("الساعات الناقصة")}: <bdi>{duration(data.missingMs)}</bdi> ·{" "}
          {t("الساعات الإضافية")}: <bdi>{duration(data.overtimeMs)}</bdi>
        </p>
      )}
      {data.mode === "fixed" && (
        <p>
          {t("التأخير بعد هامش السماح بالدقائق")}:{" "}
          {Math.floor((data.lateMs ?? 0) / 60000)}
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
                  {data.canReview && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        const decision = (
                          e.nativeEvent as SubmitEvent
                        ).submitter?.getAttribute("value");
                        void save(() =>
                          api(`/members/${member}/early-time-review`, {
                            date,
                            sessionId: r.id,
                            planId: data.planId,
                            shiftStart: data.startAt,
                            earlyMs: r.earlyMs,
                            decision,
                            reason: f.get("reason"),
                          }),
                        );
                      }}
                    >
                      <Field name={t("سبب قرار الوقت المبكر")}>
                        <input
                          name="reason"
                          required
                          minLength={5}
                          maxLength={500}
                          disabled={busy}
                        />
                      </Field>
                      <button value="approve" disabled={busy}>
                        {t("اعتماد الوقت المبكر")}
                      </button>{" "}
                      <button className="ghost" value="reject" disabled={busy}>
                        {t("رفض الوقت المبكر")}
                      </button>
                    </form>
                  )}
                </>
              ) : (
                t("جلسة لا يمكن نسبتها للشفت تلقائياً؛ تحتاج مراجعة.")
              )}
            </li>
          ))}
        </ul>
      )}
      {data.decisions?.length > 0 && (
        <ul>
          {data.decisions.map((d: any) => (
            <li key={d.sessionId}>
              {t(
                d.decision === "approve"
                  ? "تم اعتماد الوقت المبكر"
                  : "تم رفض الوقت المبكر",
              )}
              : {d.reason}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WeekSummary({
  member,
  date,
  revision,
  selectDate,
  busy,
}: {
  member: string;
  date: string;
  revision: number;
  selectDate: (date: string) => void;
  busy: boolean;
}) {
  const current = useLoad(
    `/members/${member}/workweek-summary?date=${date}`,
    revision,
  );
  const previousDate = new Date(date + "T12:00:00Z");
  previousDate.setUTCDate(previousDate.getUTCDate() - 7);
  const previous = useLoad(
    `/members/${member}/workweek-summary?date=${previousDate.toISOString().slice(0, 10)}`,
    revision,
  );
  const hours = (ms: number | null) =>
    ms === null
      ? "—"
      : `${Math.floor(ms / 3600000)}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}`;
  return (
    <section className="card padded">
      <h2>{t("تقويم ساعات الأسبوع")}</h2>
      {!current && <p role="status">{t("عم نحسب ساعات الأسبوع…")}</p>}
      {current?.error && (
        <p className="error" role="alert">
          {current.error}
        </p>
      )}
      {current?.data && (
        <>
          <p>
            <bdi>
              {current.data.start} — {current.data.end}
            </bdi>
          </p>
          <p>
            {t("الصافي هذا الأسبوع")}: <bdi>{hours(current.data.actualMs)}</bdi>
            {previous?.data && (
              <>
                {" "}
                · {t("الأسبوع السابق")}:{" "}
                <bdi>{hours(previous.data.actualMs)}</bdi>
              </>
            )}
          </p>
          <p>
            {t("المطلوب")}: <bdi>{hours(current.data.requiredMs)}</bdi> ·{" "}
            {t("الساعات الناقصة")}: <bdi>{hours(current.data.missingMs)}</bdi> ·{" "}
            {t("الساعات الإضافية")}: <bdi>{hours(current.data.overtimeMs)}</bdi>
          </p>
          <p>
            {t(
              "الأرقام أولية؛ النقص ليس خصماً تلقائياً والإضافي ليس راتباً معتمداً.",
            )}
          </p>
          {current.data.policyChanged && (
            <p className="error">
              {t(
                "تغيّر الهدف أو توجد عطلة خلال الأسبوع؛ المقارنة تحتاج مراجعة دون تقسيم تلقائي للهدف.",
              )}
            </p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("التاريخ")}</th>
                  <th>{t("الشفت المخطط")}</th>
                  <th>{t("الصافي")}</th>
                  <th>{t("الحالة")}</th>
                </tr>
              </thead>
              <tbody>
                {current.data.days.map((d: any) => (
                  <tr key={d.date}>
                    <td>
                      <button
                        className="ghost"
                        disabled={busy}
                        onClick={() => selectDate(d.date)}
                      >
                        <bdi>{d.date}</bdi>
                      </button>
                    </td>
                    <td>
                      {d.shift ? (
                        <>
                          <span>{d.shift.name}</span>
                          <br />
                          <bdi>
                            {d.shift.start} — {d.shift.end}
                          </bdi>
                        </>
                      ) : d.mode === "target" ? (
                        t("هدف ساعات")
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <bdi>{d.total ? hours(d.total.netMs) : "—"}</bdi>
                    </td>
                    <td>
                      {d.holiday && (
                        <span>
                          {t("عطلة رسمية")}: {d.holiday}
                          <br />
                        </span>
                      )}
                      {d.status === "off"
                        ? t("عطلة")
                        : d.status === "no_plan"
                          ? t("لا توجد خطة")
                          : d.status !== "ok"
                            ? t("تحتاج مراجعة")
                            : d.complete
                              ? t("مكتمل مبدئياً")
                              : t("غير مكتمل")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {previous?.error && <p className="error">{previous.error}</p>}
    </section>
  );
}

function TimeRequests({
  member,
  self,
  date,
  revision,
  busy,
  save,
}: {
  member: string;
  self: boolean;
  date: string;
  revision: number;
  busy: boolean;
  save: (fn: () => Promise<any>) => Promise<void>;
}) {
  const manual = useLoad(`/members/${member}/manual-time`, revision),
    sheets = useLoad(`/members/${member}/timesheets`, revision);
  const [autofill, setAutofill] = useState(false);
  const status = (value: string) =>
    t(
      value === "pending"
        ? "بانتظار القرار"
        : value === "approved"
          ? "معتمد"
          : "مرفوض",
    );
  const reviewForm = (path: string) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const decision = (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
          "value",
        );
        void save(() => api(path, { decision, reason: f.get("reason") }));
      }}
    >
      <Field name={t("سبب القرار")}>
        <input
          name="reason"
          required
          minLength={5}
          maxLength={500}
          disabled={busy}
        />
      </Field>
      <button value="approved" disabled={busy}>
        {t("اعتماد")}
      </button>{" "}
      <button value="rejected" className="ghost" disabled={busy}>
        {t("رفض")}
      </button>
    </form>
  );
  return (
    <section className="card padded">
      <h2>{t("طلبات الوقت وكشوف الساعات")}</h2>
      {self && (
        <details>
          <summary>{t("نسيت تسجيل الحضور؟")}</summary>
          <p>{t("الأوقات حسب منطقة الشركة، ولا تُحتسب قبل موافقة المدير.")}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save(() =>
                api("/manual-time", {
                  date,
                  autofill,
                  ...(!autofill
                    ? { startLocal: f.get("start"), endLocal: f.get("end") }
                    : {}),
                  reason: f.get("reason"),
                }),
              );
            }}
          >
            <fieldset
              disabled={busy}
              style={{ border: 0, padding: 0, minWidth: 0 }}
            >
              <label>
                <input
                  style={{ width: "auto" }}
                  type="checkbox"
                  checked={autofill}
                  onChange={(e) => setAutofill(e.target.checked)}
                />
                {t("تعبئة تلقائية حسب الجدول")}
              </label>
              {!autofill && (
                <>
                  <Field name={t("وقت الدخول المطلوب")}>
                    <input
                      name="start"
                      type="datetime-local"
                      defaultValue={`${date}T08:00`}
                      required
                    />
                  </Field>
                  <Field name={t("وقت الخروج المطلوب")}>
                    <input
                      name="end"
                      type="datetime-local"
                      defaultValue={`${date}T16:00`}
                      required
                    />
                  </Field>
                </>
              )}
              <Field name={t("سبب الطلب")}>
                <input name="reason" required minLength={5} maxLength={500} />
              </Field>
              <button>{t("إرسال طلب الوقت")}</button>
            </fieldset>
          </form>
        </details>
      )}
      <h3>{t("طلبات الوقت اليدوي")}</h3>
      {!manual && <p role="status">{t("عم نحمّل الطلبات…")}</p>}
      {manual?.error && (
        <p role="alert" className="error">
          {manual.error}
        </p>
      )}
      {manual?.data?.items.length === 0 && <p>{t("لا توجد طلبات")}</p>}
      {manual?.data?.items.map((r: any) => (
        <details key={r.id}>
          <summary>
            <bdi>{r.work_date}</bdi> · {status(r.status)}
          </summary>
          <p>{r.reason}</p>
          <p>
            <bdi>
              {new Intl.DateTimeFormat(locale, {
                timeZone: r.timezone,
                dateStyle: "short",
                timeStyle: "short",
              }).format(r.in_at)}{" "}
              —{" "}
              {new Intl.DateTimeFormat(locale, {
                timeZone: r.timezone,
                dateStyle: "short",
                timeStyle: "short",
              }).format(r.out_at)}
            </bdi>{" "}
            {r.timezone}
          </p>
          {r.review_reason && <p>{r.review_reason}</p>}
          {manual.data.canReview &&
            r.status === "pending" &&
            reviewForm(`/manual-time/${r.id}/review`)}
        </details>
      ))}
      <h3>{t("كشوف الساعات الأسبوعية")}</h3>
      <p>{t("الكشف المعتمد يحفظ نسخة ثابتة من الساعات؛ ليس إيصال راتب.")}</p>
      {self && (
        <button
          disabled={busy}
          onClick={() => void save(() => api("/timesheets", { date }))}
        >
          {t("إرسال أسبوع التاريخ المختار للاعتماد")}
        </button>
      )}
      {!sheets && <p role="status">{t("عم نحمّل الطلبات…")}</p>}
      {sheets?.error && (
        <p role="alert" className="error">
          {sheets.error}
        </p>
      )}
      {sheets?.data?.items.map((r: any) => {
        const snapshot = JSON.parse(r.snapshot);
        return (
          <details key={r.id}>
            <summary>
              <bdi>{r.week_start}</bdi> · {status(r.status)}
            </summary>
            <p>
              {t("صافي الساعات")}: {(snapshot.actualMs / 3600000).toFixed(2)}
            </p>
            {r.reason && <p>{r.reason}</p>}
            {sheets.data.canReview &&
              r.status === "pending" &&
              reviewForm(`/timesheets/${r.id}/review`)}
          </details>
        );
      })}
    </section>
  );
}
