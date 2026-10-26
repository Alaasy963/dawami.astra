import { t } from "./i18n";
export function locationErrorMessage(code?: number) {
  if (code === 1)
    return t(
      "إذن الموقع محظور. فعّل خدمات الموقع واسمح لهذا الموقع من إعدادات المتصفح، ثم أعد المحاولة.",
    );
  if (code === 2)
    return t(
      "إشارة الموقع غير متاحة حالياً. انتقل لمكان بإشارة أفضل وتأكد من تشغيل خدمات الموقع، ثم أعد المحاولة.",
    );
  if (code === 3)
    return t(
      "انتهت مهلة تحديد الموقع. جرّب قرب نافذة أو بمكان مفتوح، ثم أعد المحاولة.",
    );
  return t("تعذّر تحديد الموقع. أعد المحاولة من متصفح يدعم خدمات الموقع.");
}
export function getCurrentLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error(locationErrorMessage()));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (error) => reject(new Error(locationErrorMessage(error.code))),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
