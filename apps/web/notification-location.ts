/** Only complete, bounded map links may supply notification coordinates. */
export function notificationLocation(
  value: unknown,
): { lat: number; lng: number } | null {
  if (typeof value !== "string") return null;
  try {
    const params = new URL(value, "https://dawami.invalid").searchParams;
    if (params.get("view") !== "location") return null;
    const coordinates = ["lat", "lng"].map((key) => {
      const values = params.getAll(key);
      if (values.length !== 1 || !values[0].trim()) return NaN;
      // URL coordinates use decimal notation, never hex or other number syntaxes.
      const raw = values[0].trim();
      return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) ? Number(raw) : NaN;
    });
    const [lat, lng] = coordinates;
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    )
      return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
