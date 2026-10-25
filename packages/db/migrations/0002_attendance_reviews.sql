CREATE TABLE `attendance_reviews` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`actor` text NOT NULL,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`decided_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sync_operations` ADD `branch_id` text;--> statement-breakpoint
ALTER TABLE `sync_operations` ADD `device_hash` text;