import { api, ApiError } from "./lib";
import { t } from "./i18n";
export async function searchPlaces(query: string) {
  try {
    return await api("/places/search?q=" + encodeURIComponent(query));
  } catch (error) {
    // Photon permits browser CORS. Use it if the Worker cannot reach its origin.
    // Never bypass authentication, authorization or rate-limit responses.
    if (!(error instanceof ApiError) || error.status !== 503) throw error;
    try {
      const url = new URL("https://photon.komoot.io/api/");
      url.searchParams.set("q", query);
      url.searchParams.set("limit", "5");
      const response = await fetch(url, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("provider unavailable");
      const data: any = await response.json();
      const items = (data.features ?? []).flatMap((feature: any) => {
        const [lng, lat] = feature.geometry?.coordinates ?? [];
        if (
          !Number.isFinite(lat) ||
          !Number.isFinite(lng) ||
          Math.abs(lat) > 90 ||
          Math.abs(lng) > 180
        )
          return [];
        const p = feature.properties ?? {};
        const label = [
          ...new Set(
            [
              p.name,
              p.street,
              p.housenumber,
              p.city,
              p.state,
              p.country,
            ].filter((x) => typeof x === "string" && x),
          ),
        ].join("، ");
        return label ? [{ lat, lng, label }] : [];
      });
      return { items };
    } catch {
      throw new Error(
        t("تعذّر البحث عن العنوان. جرّب مجدداً أو حدد النقطة على الخريطة."),
      );
    }
  }
}
