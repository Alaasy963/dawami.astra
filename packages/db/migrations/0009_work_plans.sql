CREATE TABLE `shift_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`template_id` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`start_minute` integer NOT NULL,
	`end_minute` integer NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`actor` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`actor`) REFERENCES `memberships`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shift_valid_minutes" CHECK("shift_versions"."start_minute" BETWEEN 0 AND 1439 AND "shift_versions"."end_minute" BETWEEN 0 AND 1439 AND "shift_versions"."start_minute" <> "shift_versions"."end_minute"),
	CONSTRAINT "shift_positive_version" CHECK("shift_versions"."version" > 0),
	CONSTRAINT "shift_archive_boolean" CHECK("shift_versions"."archived" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_version_number` ON `shift_versions` (`company_id`,`template_id`,`version`);--> statement-breakpoint
CREATE TABLE `work_plan_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`version` integer NOT NULL,
	`effective_from` text NOT NULL,
	`timezone` text NOT NULL,
	`plan` text NOT NULL,
	`actor` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`membership_id`) REFERENCES `memberships`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`company_id`,`actor`) REFERENCES `memberships`(`company_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "work_plan_positive_version" CHECK("work_plan_versions"."version" > 0),
	CONSTRAINT "work_plan_object" CHECK(json_valid("work_plan_versions"."plan") AND json_type("work_plan_versions"."plan") = 'object'),
	CONSTRAINT "work_plan_date" CHECK(length("work_plan_versions"."effective_from") = 10 AND "work_plan_versions"."effective_from" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date("work_plan_versions"."effective_from", '+0 days') IS NOT NULL AND date("work_plan_versions"."effective_from", '+0 days') = "work_plan_versions"."effective_from")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_plan_version_number` ON `work_plan_versions` (`company_id`,`membership_id`,`version`);--> statement-breakpoint
CREATE INDEX `work_plan_effective` ON `work_plan_versions` (`company_id`,`membership_id`,`effective_from`,`version`);
--> statement-breakpoint
CREATE TRIGGER shift_versions_no_update BEFORE UPDATE ON shift_versions BEGIN SELECT RAISE(ABORT, 'schedule_version_append_only'); END;

--> statement-breakpoint
CREATE TRIGGER shift_versions_no_delete BEFORE DELETE ON shift_versions BEGIN SELECT RAISE(ABORT, 'schedule_version_append_only'); END;

--> statement-breakpoint
CREATE TRIGGER work_plan_versions_no_update BEFORE UPDATE ON work_plan_versions BEGIN SELECT RAISE(ABORT, 'schedule_version_append_only'); END;

--> statement-breakpoint
CREATE TRIGGER work_plan_versions_no_delete BEFORE DELETE ON work_plan_versions BEGIN SELECT RAISE(ABORT, 'schedule_version_append_only'); END;
