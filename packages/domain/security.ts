import {
  scrypt as nodeScrypt,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
const derive = (pin: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    nodeScrypt(
      pin,
      salt,
      32,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (e, k) => (e ? reject(e) : resolve(k)),
    ),
  );
export async function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await derive(pin, salt)).toString("hex")}`;
}
export async function verifyPin(pin: string, hash: string) {
  const [kind, salt, key] = hash.split("$");
  if (kind !== "scrypt" || !salt || !key) return false;
  const actual = await derive(pin, salt);
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function distance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const rad = (x: number) => (x * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) *
      Math.cos(rad(lat2)) *
      Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export const activeCompany = (
  c: { status: string; ends_at: number },
  now = Date.now(),
) => ["active", "trial"].includes(c.status) && c.ends_at > now;
export function canReset(actor: string, target: string) {
  return actor === "owner"
    ? target === "gm"
    : actor === "gm"
      ? ["worker", "manager", "am"].includes(target)
      : ["am", "manager"].includes(actor) && target === "worker";
}
export function canRebind(actor: string, target: string) {
  return actor === "owner"
    ? target === "gm"
    : actor === "gm"
      ? ["worker", "manager", "am"].includes(target)
      : ["am", "manager"].includes(actor) && target === "worker";
}

/** Calendar billing periods clamp to the final day of the target UTC month. */
export function addSubscriptionMonths(timestamp: number, months: number) {
  const date = new Date(timestamp),
    day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date.getTime();
}
