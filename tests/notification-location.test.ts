import { describe, expect, it } from "vitest";
import { notificationLocation } from "../apps/web/notification-location";

describe("notification map links", () => {
  it("accepts absolute and relative map links", () => {
    expect(
      notificationLocation("/?view=location&lat=52.52&lng=13.405"),
    ).toEqual({ lat: 52.52, lng: 13.405 });
    expect(
      notificationLocation(
        "https://example.com/?view=location&lat=-90&lng=180",
      ),
    ).toEqual({ lat: -90, lng: 180 });
  });
  it("preserves explicitly supplied zero coordinates", () => {
    expect(notificationLocation("/?view=location&lat=0&lng=0")).toEqual({
      lat: 0,
      lng: 0,
    });
  });
  it.each([
    "/?view=location",
    "/?view=location&lat=52",
    "/?view=location&lat=&lng=13",
    "/?view=location&lat=%20&lng=13",
    "/?view=location&lat=NaN&lng=13",
    "/?view=location&lat=91&lng=13",
    "/?view=location&lat=52&lng=-181",
    "/?view=location&lat=0x10&lng=13",
    "/?view=location&lat=52&lat=53&lng=13",
    "/?view=notifications&lat=52&lng=13",
    "http://[",
    null,
  ])("clears the map for invalid or non-location links: %s", (url) => {
    expect(notificationLocation(url)).toBeNull();
  });
});
