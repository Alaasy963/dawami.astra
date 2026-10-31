CREATE TABLE `manual_time_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`work_date` text NOT NULL,
	`in_at` integer NOT NULL,
	`out_at` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewer` text,
	`review_reason` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`plan_id`) REFERENCES `work_plan_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`membership_id`) REFERENCES `memberships`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "manual_time_status" CHECK("manual_time_requests"."status" IN ('pending','approved','rejected')),
	CONSTRAINT "manual_time_duration" CHECK("manual_time_requests"."out_at">"manual_time_requests"."in_at" AND "manual_time_requests"."out_at"-"manual_time_requests"."in_at"<=86400000)
);
--> statement-breakpoint
CREATE INDEX `manual_time_member` ON `manual_time_requests` (`company_id`,`membership_id`,`in_at`);--> statement-breakpoint
CREATE TABLE `timesheets` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`week_start` text NOT NULL,
	`snapshot` text NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewer` text,
	`reason` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`company_id`,`membership_id`) REFERENCES `memberships`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "timesheet_status" CHECK("timesheets"."status" IN ('pending','approved','rejected'))
);
--> statement-breakpoint
CREATE INDEX `timesheet_member` ON `timesheets` (`company_id`,`membership_id`,`week_start`);
--> statement-breakpoint
CREATE UNIQUE INDEX timesheet_one_active ON timesheets(company_id,membership_id,week_start) WHERE status IN ('pending','approved');
--> statement-breakpoint
CREATE TRIGGER manual_insert_guard BEFORE INSERT ON manual_time_requests WHEN NEW.status<>'pending' OR NOT EXISTS(SELECT 1 FROM work_plan_versions WHERE id=NEW.plan_id AND company_id=NEW.company_id AND membership_id=NEW.membership_id) OR EXISTS(SELECT 1 FROM manual_time_requests WHERE company_id=NEW.company_id AND membership_id=NEW.membership_id AND status IN ('pending','approved') AND in_at<NEW.out_at AND out_at>NEW.in_at) OR EXISTS(SELECT 1 FROM attendance_logs WHERE company_id=NEW.company_id AND membership_id=NEW.membership_id AND in_at<NEW.out_at AND (out_at IS NULL OR out_at>NEW.in_at)) BEGIN SELECT RAISE(ABORT,'manual_time_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER manual_review_guard BEFORE UPDATE ON manual_time_requests WHEN OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected') OR NEW.id<>OLD.id OR NEW.company_id<>OLD.company_id OR NEW.membership_id<>OLD.membership_id OR NEW.plan_id<>OLD.plan_id OR NEW.in_at<>OLD.in_at OR NEW.out_at<>OLD.out_at OR NEW.work_date<>OLD.work_date OR NEW.reason<>OLD.reason OR NEW.created_at<>OLD.created_at OR NEW.reviewer IS NULL OR NEW.reviewer=NEW.membership_id OR NOT EXISTS(SELECT 1 FROM memberships WHERE id=NEW.reviewer AND company_id=NEW.company_id) OR (NEW.status='approved' AND EXISTS(SELECT 1 FROM attendance_logs WHERE company_id=NEW.company_id AND membership_id=NEW.membership_id AND in_at<NEW.out_at AND (out_at IS NULL OR out_at>NEW.in_at))) BEGIN SELECT RAISE(ABORT,'manual_time_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER manual_no_delete BEFORE DELETE ON manual_time_requests BEGIN SELECT RAISE(ABORT,'manual_time_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER timesheet_review_guard BEFORE UPDATE ON timesheets WHEN OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected') OR NEW.id<>OLD.id OR NEW.company_id<>OLD.company_id OR NEW.membership_id<>OLD.membership_id OR NEW.week_start<>OLD.week_start OR NEW.snapshot<>OLD.snapshot OR NEW.fingerprint<>OLD.fingerprint OR NEW.created_at<>OLD.created_at OR NEW.reviewer IS NULL OR NEW.reviewer=NEW.membership_id OR NOT EXISTS(SELECT 1 FROM memberships WHERE id=NEW.reviewer AND company_id=NEW.company_id) BEGIN SELECT RAISE(ABORT,'timesheet_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER timesheet_no_delete BEFORE DELETE ON timesheets BEGIN SELECT RAISE(ABORT,'timesheet_immutable'); END;
