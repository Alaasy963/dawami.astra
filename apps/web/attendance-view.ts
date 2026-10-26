import type { Operation } from "./lib";
type Session = { in_at: number; out_at?: number | null };
export function attendanceView(
  sessions: Session[] | undefined,
  operations: Operation[],
) {
  let open: { in_at: number; provisional: boolean } | null = sessions?.find(
    (s) => !s.out_at,
  )
    ? { in_at: sessions.find((s) => !s.out_at)!.in_at, provisional: false }
    : null;
  const latestServerTime = Math.max(
    0,
    ...(sessions ?? []).flatMap((s) => [s.in_at, s.out_at ?? 0]),
  );
  const local = operations
    .filter(
      (o) =>
        o.state !== "error" &&
        (sessions === undefined ||
          o.state === "pending" ||
          o.state === "review"),
    )
    .filter((o) => o.deviceTime > latestServerTime)
    .sort((a, b) => a.deviceTime - b.deviceTime);
  for (const op of local) {
    if (op.action === "in" && !open)
      open = { in_at: op.deviceTime, provisional: true };
    else if (op.action === "out") open = null;
  }
  return open;
}
export function elapsedTime(start: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}
