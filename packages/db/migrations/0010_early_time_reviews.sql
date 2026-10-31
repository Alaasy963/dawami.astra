CREATE TABLE `early_time_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`session_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`in_at` integer NOT NULL,
	`shift_start` integer NOT NULL,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `attendance_logs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_id`) REFERENCES `work_plan_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`actor`) REFERENCES `memberships`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "early_review_decision" CHECK("early_time_reviews"."decision" IN ('approve','reject')),
	CONSTRAINT "early_review_bounds" CHECK("early_time_reviews"."in_at" < "early_time_reviews"."shift_start")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `early_review_once` ON `early_time_reviews` (`company_id`,`session_id`,`plan_id`);
--> statement-breakpoint
CREATE TRIGGER early_review_tenant BEFORE INSERT ON early_time_reviews WHEN NOT EXISTS(SELECT 1 FROM attendance_logs a JOIN work_plan_versions p ON p.membership_id=a.membership_id AND p.company_id=a.company_id WHERE a.id=NEW.session_id AND p.id=NEW.plan_id AND a.company_id=NEW.company_id AND a.in_at=NEW.in_at AND a.out_at IS NOT NULL AND a.out_at>NEW.shift_start AND a.membership_id<>NEW.actor) BEGIN SELECT RAISE(ABORT,'early_review_invalid'); END;
--> statement-breakpoint
CREATE TRIGGER early_review_no_update BEFORE UPDATE ON early_time_reviews BEGIN SELECT RAISE(ABORT,'early_review_append_only'); END;
--> statement-breakpoint
CREATE TRIGGER early_review_no_delete BEFORE DELETE ON early_time_reviews BEGIN SELECT RAISE(ABORT,'early_review_append_only'); END;
