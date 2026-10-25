import english from "./en.json";
export type Language = "ar" | "en";
export const language: Language =
  typeof localStorage !== "undefined" &&
  localStorage.getItem("language") === "en"
    ? "en"
    : "ar";
export const locale = language === "en" ? "en-GB" : "ar-u-nu-latn";
export function translate(
  key: string,
  lang: Language,
  values: unknown[] = [],
): string {
  const dictionary = english as Record<string, string>;
  const text = lang === "en" ? (dictionary[key] ?? key) : key;
  return text.replace(/\{(\d+)\}/g, (placeholder, index) =>
    index in values ? String(values[Number(index)]) : placeholder,
  );
}
export function t(key: string, values: unknown[] = []) {
  return translate(key, language, values);
}
