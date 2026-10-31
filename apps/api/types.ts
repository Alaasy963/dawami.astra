export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  STORAGE: R2Bucket;
  ASSETS: Fetcher;
  AUTH_LIMIT: RateLimit;
  PUNCH_LIMIT: RateLimit;
  ENVIRONMENT: string;
  OWNER_PHONE: string;
  OWNER_HASH: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}
export type Session = {
  userId: string;
  membershipId?: string;
  companyId?: string;
  mode: "global" | "local" | "owner";
  version: number;
  expires: number;
  csrf: string;
  device: string;
};
export type Member = {
  id: string;
  company_id: string;
  user_id: string;
  role: string;
  branch_id: string | null;
  department_id: string | null;
  status: string;
  device_hash: string | null;
  must_change: number;
  version: number;
};
export type Company = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  status: string;
  ends_at: number;
  session_days: number;
  gps_accuracy: number;
  logo_key: string | null;
  overtime_percent: number;
  weekend_days: string;
};
export type Bindings = {
  Bindings: Env;
  Variables: {
    session: Session;
    member: Member;
    company: Company;
    sid: string;
  };
};
