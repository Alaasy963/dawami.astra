import { useEffect, useState } from "react";
import { api } from "./lib";
import { t, locale } from "./i18n";
export default function TimeInbox() {
  const [status, setStatus] = useState("pending"),
    [data, setData] = useState<any>(null),
    [selected, setSelected] = useState<any>(null),
    [detail, setDetail] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setData(null);
    setSelected(null);
    setError("");
    api(`/time-inbox?status=${status}`)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [status, revision]);
  useEffect(() => {
    let live = true;
    setDetail(null);
    if (selected)
      api(
        `/members/${selected.membership_id}/${selected.kind === "manual" ? "manual-time" : "timesheets"}`,
      )
        .then((d) => {
          if (live) setDetail(d.items.find((r: any) => r.id === selected.id));
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [selected]);
  const format = (v: number, zone: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      dateStyle: "short",
      timeStyle: "short",
    }).format(v);
  return (
    <section className="card padded">
      <h2>{t("طلبات الوقت")}</h2>
      <label>
        {t("الحالة")}
        <select
          value={status}
          disabled={busy}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="pending">{t("بانتظار القرار")}</option>
          <option value="approved">{t("معتمد")}</option>
          <option value="rejected">{t("مرفوض")}</option>
        </select>
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">{t("عم نحمّل الطلبات…")}</p>}
      {data?.items.length === 0 && <p>{t("لا توجد طلبات")}</p>}
      {data?.truncated && <p>{t("تظهر أحدث 100 نتيجة فقط")}</p>}
      {data?.items.map((r: any) => (
        <button
          className="choice"
          disabled={busy}
          key={r.kind + r.id}
          onClick={() => {
            setSelected(r);
            setError("");
          }}
        >
          <strong>{r.name}</strong> ·{" "}
          {t(
            r.kind === "manual"
              ? "طلبات الوقت اليدوي"
              : "كشوف الساعات الأسبوعية",
          )}{" "}
          · <bdi>{r.date}</bdi>
        </button>
      ))}
      {selected && (
        <section className="card padded">
          <h3>
            {selected.name} · <bdi>{selected.date}</bdi>
          </h3>
          {!detail && !error && <p role="status">{t("عم نحمّل الطلبات…")}</p>}
          {detail && (
            <>
              <p>{detail.reason}</p>
              {selected.kind === "manual" ? (
                <p>
                  <bdi>
                    {format(detail.in_at, detail.timezone)} —{" "}
                    {format(detail.out_at, detail.timezone)}
                  </bdi>{" "}
                  · {detail.timezone}
                </p>
              ) : (
                <>
                  <p>
                    {t(
                      "الكشف المعتمد يحفظ نسخة ثابتة من الساعات؛ ليس إيصال راتب.",
                    )}
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t("التاريخ")}</th>
                          <th>{t("صافي الساعات")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {JSON.parse(detail.snapshot).days.map((d: any) => (
                          <tr key={d.date}>
                            <td>
                              <bdi>{d.date}</bdi>
                            </td>
                            <td>
                              {((d.total?.netMs ?? 0) / 3600000).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {detail.review_reason && <p>{detail.review_reason}</p>}
              {selected.canReview && detail.status === "pending" && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      values = new FormData(form),
                      decision = (
                        e.nativeEvent as SubmitEvent
                      ).submitter?.getAttribute("value");
                    setBusy(true);
                    setError("");
                    try {
                      await api(
                        `/${selected.kind === "manual" ? "manual-time" : "timesheets"}/${selected.id}/review`,
                        { decision, reason: values.get("reason") },
                      );
                      setRevision((v) => v + 1);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    {t("سبب القرار")}
                    <input
                      name="reason"
                      minLength={5}
                      maxLength={500}
                      required
                      disabled={busy}
                    />
                  </label>
                  <button value="approved" disabled={busy}>
                    {t("اعتماد")}
                  </button>{" "}
                  <button className="ghost" value="rejected" disabled={busy}>
                    {t("رفض")}
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      )}
    </section>
  );
}
