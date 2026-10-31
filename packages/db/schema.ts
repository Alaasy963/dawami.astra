import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
  foreignKey,
  check,
} from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: text().primaryKey(),
  phone: text().notNull().unique(),
  name: text().notNull(),
  passwordHash: text("password_hash").notNull(),
  version: integer().notNull().default(1),
  mustChange: integer("must_change").notNull().default(0),
});
export const platform = sqliteTable("platform_settings", {
  id: integer().primaryKey(),
  trialDays: integer("trial_days").notNull().default(14),
  monthly: integer().notNull().default(0),
  yearly: integer().notNull().default(0),
});
export const companies = sqliteTable("companies", {
  id: text().primaryKey(),
  name: text().notNull(),
  currency: text().notNull().default("SYP"),
  timezone: text().notNull().default("Asia/Damascus"),
  status: text().notNull().default("trial"),
  endsAt: integer("ends_at").notNull(),
  createdAt: integer("created_at").notNull(),
  sessionDays: integer("session_days").notNull().default(7),
  gpsAccuracy: integer("gps_accuracy").notNull().default(100),
  logoKey: text("logo_key"),
  overtimePercent: real("overtime_percent").notNull().default(0),
  weekendDays: text("weekend_days").notNull().default("[4]"),
});
export const branches = sqliteTable(
  "branches",
  {
    id: text().primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    name: text().notNull(),
    lat: real().notNull(),
    lng: real().notNull(),
    radius: real().notNull(),
  },
  (t) => [uniqueIndex("branch_tenant").on(t.companyId, t.id)],
);
export const departments = sqliteTable(
  "departments",
  {
    id: text().primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    name: text().notNull(),
  },
  (t) => [uniqueIndex("department_tenant").on(t.companyId, t.id)],
);
export const memberships = sqliteTable(
  "memberships",
  {
    id: text().primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text().notNull(),
    branchId: text("branch_id"),
    departmentId: text("department_id"),
    status: text().notNull().default("active"),
    deviceHash: text("device_hash"),
    localHash: text("local_hash"),
    mustChange: integer("must_change").notNull().default(0),
    version: integer().notNull().default(1),
    timeRevision: integer("time_revision").notNull().default(0),
  },
  (t) => [
    uniqueIndex("membership_identity").on(t.companyId, t.userId),
    uniqueIndex("membership_tenant").on(t.companyId, t.id),
  ],
);
export const scopes = sqliteTable("manager_scopes", {
  id: text().primaryKey(),
  companyId: text("company_id").notNull(),
  membershipId: text("membership_id").notNull(),
  branchId: text("branch_id"),
  departmentId: text("department_id"),
});
export const punches = sqliteTable("attendance_logs", {
  id: text().primaryKey(),
  companyId: text("company_id").notNull(),
  membershipId: text("membership_id").notNull(),
  branchId: text("branch_id").notNull(),
  inAt: integer("in_at").notNull(),
  outAt: integer("out_at"),
  inLat: real("in_lat").notNull(),
  inLng: real("in_lng").notNull(),
  outLat: real("out_lat"),
  outLng: real("out_lng"),
  deviceHash: text("device_hash").notNull(),
  workDate: text("work_date").notNull(),
});
export const sync = sqliteTable(
  "sync_operations",
  {
    id: text().primaryKey(),
    companyId: text("company_id").notNull(),
    membershipId: text("membership_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    payload: text().notNull(),
    status: text().notNull(),
    result: text().notNull(),
    receivedAt: integer("received_at").notNull(),
    branchId: text("branch_id"),
    deviceHash: text("device_hash"),
  },
  (t) => [index("sync_tenant").on(t.companyId, t.membershipId)],
);
export const audit = sqliteTable("audit_logs", {
  id: text().primaryKey(),
  companyId: text("company_id").notNull(),
  actor: text().notNull(),
  role: text().notNull(),
  action: text().notNull(),
  target: text().notNull(),
  before: text(),
  after: text(),
  reason: text().notNull(),
  createdAt: integer("created_at").notNull(),
  ip: text(),
});
export const subscriptions = sqliteTable("subscriptions", {
  id: text().primaryKey(),
  companyId: text("company_id").notNull(),
  kind: text().notNull(),
  startsAt: integer("starts_at").notNull(),
  endsAt: integer("ends_at").notNull(),
  actor: text().notNull(),
});
export const notifications = sqliteTable("notifications", {
  id: text().primaryKey(),
  companyId: text("company_id").notNull(),
  recipient: text().notNull(),
  title: text().notNull(),
  body: text().notNull(),
  url: text().notNull(),
  readAt: integer("read_at"),
  createdAt: integer("created_at").notNull(),
});
export const push = sqliteTable(
  "push_subscriptions",
  {
    id: text().primaryKey(),
    companyId: text("company_id").notNull(),
    membershipId: text("membership_id").notNull(),
    endpoint: text().notNull(),
    subscription: text().notNull(),
  },
  (t) => [
    uniqueIndex("push_membership_endpoint").on(
      t.companyId,
      t.membershipId,
      t.endpoint,
    ),
  ],
);
export const outbox = sqliteTable("notification_outbox", {
  id: text().primaryKey(),
  companyId: text("company_id").notNull(),
  recipient: text().notNull(),
  payload: text().notNull(),
  attempts: integer().notNull().default(0),
  nextAt: integer("next_at").notNull(),
  status: text().notNull().default("pending"),
  leaseToken: text("lease_token"),
  leaseUntil: integer("lease_until").notNull().default(0),
});
export const rebinds = sqliteTable("device_rebind_requests", {
  id: text().primaryKey(),
  companyId: text("company_id").notNull(),
  membershipId: text("membership_id").notNull(),
  deviceHash: text("device_hash").notNull(),
  reason: text().notNull(),
  status: text().notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
});

export const attendanceReviews = sqliteTable("attendance_reviews", {
  operationId: text("operation_id").primaryKey(),
  companyId: text("company_id").notNull(),
  actor: text().notNull(),
  decision: text().notNull(),
  reason: text().notNull(),
  decidedAt: integer("decided_at").notNull(),
});

// Append-only versions: a saved worker plan owns its schedule snapshot.
export const shiftVersions = sqliteTable(
  "shift_versions",
  {
    id: text().primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    templateId: text("template_id").notNull(),
    version: integer().notNull(),
    name: text().notNull(),
    startMinute: integer("start_minute").notNull(),
    endMinute: integer("end_minute").notNull(),
    archived: integer().notNull().default(0),
    actor: text().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("shift_version_number").on(
      t.companyId,
      t.templateId,
      t.version,
    ),
    foreignKey({
      columns: [t.companyId, t.actor],
      foreignColumns: [memberships.companyId, memberships.id],
    }),
    check(
      "shift_valid_minutes",
      sql`${t.startMinute} BETWEEN 0 AND 1439 AND ${t.endMinute} BETWEEN 0 AND 1439 AND ${t.startMinute} <> ${t.endMinute}`,
    ),
    check("shift_positive_version", sql`${t.version} > 0`),
    check("shift_archive_boolean", sql`${t.archived} IN (0,1)`),
  ],
);

export const workPlanVersions = sqliteTable(
  "work_plan_versions",
  {
    id: text().primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    membershipId: text("membership_id").notNull(),
    version: integer().notNull(),
    effectiveFrom: text("effective_from").notNull(),
    timezone: text().notNull(),
    // Validated plan JSON: copied shift times, weekdays, targets and break policy.
    plan: text().notNull(),
    actor: text().notNull(),
    reason: text().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("work_plan_version_number").on(
      t.companyId,
      t.membershipId,
      t.version,
    ),
    index("work_plan_effective").on(
      t.companyId,
      t.membershipId,
      t.effectiveFrom,
      t.version,
    ),
    foreignKey({
      columns: [t.companyId, t.membershipId],
      foreignColumns: [memberships.companyId, memberships.id],
    }),
    foreignKey({
      columns: [t.companyId, t.actor],
      foreignColumns: [memberships.companyId, memberships.id],
    }),
    check("work_plan_positive_version", sql`${t.version} > 0`),
    check(
      "work_plan_object",
      sql`json_valid(${t.plan}) AND json_type(${t.plan}) = 'object'`,
    ),
    check(
      "work_plan_date",
      sql`length(${t.effectiveFrom}) = 10 AND ${t.effectiveFrom} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(${t.effectiveFrom}, '+0 days') IS NOT NULL AND date(${t.effectiveFrom}, '+0 days') = ${t.effectiveFrom}`,
    ),
  ],
);

export const earlyTimeReviews = sqliteTable(
  "early_time_reviews",
  {
    id: text().primaryKey(),
    companyId: text("company_id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => punches.id),
    planId: text("plan_id")
      .notNull()
      .references(() => workPlanVersions.id),
    inAt: integer("in_at").notNull(),
    shiftStart: integer("shift_start").notNull(),
    decision: text().notNull(),
    reason: text().notNull(),
    actor: text().notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("early_review_once").on(t.companyId, t.sessionId, t.planId),
    foreignKey({
      columns: [t.companyId, t.actor],
      foreignColumns: [memberships.companyId, memberships.id],
    }),
    check("early_review_decision", sql`${t.decision} IN ('approve','reject')`),
    check("early_review_bounds", sql`${t.inAt} < ${t.shiftStart}`),
  ],
);

export const manualTimeRequests = sqliteTable(
  "manual_time_requests",
  {
    id: text().primaryKey(),
    companyId: text("company_id").notNull(),
    membershipId: text("membership_id").notNull(),
    planId: text("plan_id")
      .notNull()
      .references(() => workPlanVersions.id),
    workDate: text("work_date").notNull(),
    inAt: integer("in_at").notNull(),
    outAt: integer("out_at").notNull(),
    reason: text().notNull(),
    status: text().notNull().default("pending"),
    reviewer: text(),
    reviewReason: text("review_reason"),
    createdAt: integer("created_at").notNull(),
    decidedAt: integer("decided_at"),
  },
  (t) => [
    foreignKey({
      columns: [t.companyId, t.membershipId],
      foreignColumns: [memberships.companyId, memberships.id],
    }),
    index("manual_time_member").on(t.companyId, t.membershipId, t.inAt),
    check(
      "manual_time_status",
      sql`${t.status} IN ('pending','approved','rejected')`,
    ),
    check(
      "manual_time_duration",
      sql`${t.outAt}>${t.inAt} AND ${t.outAt}-${t.inAt}<=86400000`,
    ),
  ],
);
export const timesheets = sqliteTable(
  "timesheets",
  {
    id: text().primaryKey(),
    companyId: text("company_id").notNull(),
    membershipId: text("membership_id").notNull(),
    weekStart: text("week_start").notNull(),
    snapshot: text().notNull(),
    fingerprint: text().notNull(),
    sourceRevision: integer("source_revision").notNull().default(0),
    status: text().notNull().default("pending"),
    reviewer: text(),
    reason: text(),
    createdAt: integer("created_at").notNull(),
    decidedAt: integer("decided_at"),
  },
  (t) => [
    foreignKey({
      columns: [t.companyId, t.membershipId],
      foreignColumns: [memberships.companyId, memberships.id],
    }),
    index("timesheet_member").on(t.companyId, t.membershipId, t.weekStart),
    check(
      "timesheet_status",
      sql`${t.status} IN ('pending','approved','rejected')`,
    ),
  ],
);
