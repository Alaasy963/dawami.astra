CREATE TABLE `holidays` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "holiday_active" CHECK("holidays"."active" IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `holiday_company_date` ON `holidays` (`company_id`,`date`);
--> statement-breakpoint
CREATE TRIGGER holiday_revision_insert AFTER INSERT ON holidays BEGIN
 UPDATE memberships SET time_revision=time_revision+1 WHERE company_id=NEW.company_id;
END;
--> statement-breakpoint
CREATE TRIGGER holiday_revision_update AFTER UPDATE ON holidays BEGIN
 UPDATE memberships SET time_revision=time_revision+1 WHERE company_id=NEW.company_id;
END;
--> statement-breakpoint
CREATE TRIGGER holiday_no_delete BEFORE DELETE ON holidays BEGIN SELECT RAISE(ABORT,'holiday_conflict'); END;
