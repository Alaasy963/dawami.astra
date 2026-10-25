import { t, language, locale } from "./i18n";
import Dexie, { type Table } from "dexie";
export type Operation = {
  id: string;
  companyId: string;
  membershipId: string;
  action: "in" | "out";
  deviceTime: number;
  lat: number;
  lng: number;
  accuracy: number;
  offline: boolean;
  state: "pending" | "accepted" | "review" | "error";
  message?: string;
};
class LocalDB extends Dexie {
  operations!: Table<Operation, string>;
  constructor() {
    super("dawami_local_db");
    this.version(1).stores({
      operations: "id,[companyId+membershipId],state",
    });
  }
}
export const localDB = new LocalDB();
export function deviceId() {
  let d = localStorage.getItem("dawami-device");
  if (!d) {
    d = crypto.randomUUID() + crypto.randomUUID();
    localStorage.setItem("dawami-device", d);
  }
  return d;
}
let csrf = "";
export function setCsrf(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api(
  path: string,
  body?: unknown,
  method = body ? "POST" : "GET",
) {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body
        ? {
            "Content-Type": "application/json",
          }
        : {}),
      "X-CSRF-Token": csrf,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data: any = await response.json();
  if (!response.ok)
    throw new ApiError(t(data.error ?? "تعذّر الاتصال"), response.status);
  return data;
}
export async function syncQueue(companyId: string, membershipId: string) {
  const ops = await localDB.operations
    .where("[companyId+membershipId]")
    .equals([companyId, membershipId])
    .sortBy("deviceTime");
  for (const op of ops) {
    if (!["pending", "review"].includes(op.state)) continue;
    try {
      const { state, message, companyId: _, membershipId: __, ...payload } = op;
      const result = await api("/attendance/sync", payload);
      await localDB.operations.update(op.id, {
        state: result.status,
        message: result.reason,
      });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status >= 500 || [401, 403, 429].includes(e.status)) break;
        await localDB.operations.update(op.id, {
          state: "error",
          message: e.message,
        });
      } else break;
    }
  }
}
export const currencies = [
  "SYP",
  "USD",
  "AED",
  "SAR",
  "QAR",
  "KWD",
  "BHD",
  "OMR",
  ...Intl.supportedValuesOf("currency").filter(
    (x) =>
      !["SYP", "USD", "AED", "SAR", "QAR", "KWD", "BHD", "OMR"].includes(x),
  ),
];
export async function uploadLogo(file: File) {
  if (
    !["image/png", "image/jpeg"].includes(file.type) ||
    file.size > 2 * 1024 * 1024
  )
    throw new Error(t("اختر PNG أو JPEG بحجم أقل من 2 ميغابايت"));
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error(t("تعذّر تجهيز الصورة")))),
        "image/png",
      ),
    );
    if (blob.size > 256 * 1024)
      throw new Error(t("الصورة كبيرة بعد التصغير. اختر شعاراً أبسط"));
    const response = await fetch("/api/company/logo", {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
        "X-CSRF-Token": csrf,
      },
      body: blob,
    });
    if (!response.ok)
      throw new ApiError(
        t(((await response.json()) as { error: string }).error),
        response.status,
      );
  } finally {
    bitmap.close();
  }
}
