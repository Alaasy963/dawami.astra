import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import english from "../apps/web/en.json";
import { translate } from "../apps/web/i18n";
describe("interface language", () => {
  it("keeps Arabic and interpolates names without changing supplied data", () => {
    expect(translate("اسم الشركة", "ar")).toBe("اسم الشركة");
    expect(translate("صباح الشغل الحلو، {0}", "en", ["سارة"])).toBe(
      "Good day, سارة",
    );
    expect(translate("A user-written name", "en")).toBe("A user-written name");
  });
  it("provides English for every static translation key used by the interface", () => {
    for (const file of [
      "apps/web/main.tsx",
      "apps/web/Schedule.tsx",
      "apps/web/TimeInbox.tsx",
      "apps/web/Holidays.tsx",
      "apps/web/ShiftReminder.tsx",
      "apps/web/MapBoundary.tsx",
      "apps/web/lib.ts",
      "apps/web/LocationPicker.tsx",
      "apps/web/geolocation.ts",
      "apps/web/places.ts",
      "apps/web/PushControls.tsx",
      "apps/web/AppUpdate.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bt\("((?:\\.|[^"\\])*)"/g)) {
        const key = JSON.parse('"' + match[1] + '"');
        if (/[\u0600-\u06ff]/.test(key))
          expect(english, key).toHaveProperty(key);
      }
    }
  });
  it("retains all interpolation slots in the English dictionary", () => {
    for (const [key, value] of Object.entries(english))
      expect(value.match(/\{\d+\}/g) || [], key).toEqual(
        key.match(/\{\d+\}/g) || [],
      );
  });
});
