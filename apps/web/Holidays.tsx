import { useEffect, useState } from "react";
import { api } from "./lib";
import { t } from "./i18n";
import { companyDate } from "../../packages/domain/company-date";
export default function Holidays({ me }: { me: any }) {
  const today = companyDate(me.company.timezone),
    [year, setYear] = useState(today.slice(0, 4)),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api(`/holidays?year=${year}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [year, revision]);
  return (
    <section className="card padded">
      <h2>{t("العطل الرسمية")}</h2>
      <p>
        {t(
          "يضيف المدير عطل الشركة. تعديل العطل للأيام القادمة فقط ولا يغيّر السجلات السابقة.",
        )}
      </p>
      <label>
        {t("السنة")}
        <input
          type="number"
          min={2000}
          max={2200}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          disabled={busy}
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">{t("عم نحمّل الطلبات…")}</p>}
      {data?.items.length === 0 && <p>{t("لا توجد عطل مسجلة لهذه السنة")}</p>}
      {data?.items.map((h: any) => (
        <p key={h.id}>
          <bdi>{h.date}</bdi> · {h.name} · {t(h.active ? "مفعّلة" : "ملغاة")}
        </p>
      ))}
      {["gm", "am"].includes(me.member.role) && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            setBusy(true);
            setError("");
            try {
              await api("/holidays", {
                date: f.get("date"),
                name: f.get("name"),
                active: f.get("active") === "on",
                reason: f.get("reason"),
              });
              setYear(String(f.get("date")).slice(0, 4));
              setRevision((v) => v + 1);
              form.reset();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>{t("إضافة أو تعديل عطلة")}</h3>
          <p>
            {t("لتعديل عطلة موجودة أدخل التاريخ نفسه؛ أزل التفعيل لإلغائها.")}
          </p>
          <fieldset
            disabled={busy}
            style={{ border: 0, padding: 0, minWidth: 0 }}
          >
            <label>
              {t("التاريخ")}
              <input name="date" type="date" min={today} required />
            </label>
            <label>
              {t("اسم العطلة")}
              <input name="name" minLength={2} maxLength={100} required />
            </label>
            <label>
              <input
                style={{ width: "auto" }}
                name="active"
                type="checkbox"
                defaultChecked
              />
              {t("مفعّلة")}
            </label>
            <label>
              {t("سبب التغيير")}
              <input name="reason" minLength={5} maxLength={500} required />
            </label>
            <button>{t("حفظ العطلة")}</button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
