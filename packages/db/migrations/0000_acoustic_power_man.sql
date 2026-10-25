CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`actor` text NOT NULL,
	`role` text NOT NULL,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`before` text,
	`after` text,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	`ip` text
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`radius` real NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `branch_tenant` ON `branches` (`company_id`,`id`);--> statement-breakpoint
CREATE TABLE `companies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`currency` text DEFAULT 'SYP' NOT NULL,
	`timezone` text DEFAULT 'Asia/Damascus' NOT NULL,
	`status` text DEFAULT 'trial' NOT NULL,
	`ends_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`session_days` integer DEFAULT 7 NOT NULL,
	`gps_accuracy` integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `department_tenant` ON `departments` (`company_id`,`id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`branch_id` text,
	`department_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`device_hash` text,
	`local_hash` text,
	`must_change` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_identity` ON `memberships` (`company_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_tenant` ON `memberships` (`company_id`,`id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`recipient` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`url` text NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`recipient` text NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`trial_days` integer DEFAULT 14 NOT NULL,
	`monthly` integer DEFAULT 0 NOT NULL,
	`yearly` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attendance_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`in_at` integer NOT NULL,
	`out_at` integer,
	`in_lat` real NOT NULL,
	`in_lng` real NOT NULL,
	`out_lat` real,
	`out_lng` real,
	`device_hash` text NOT NULL,
	`work_date` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`subscription` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `device_rebind_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`device_hash` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `manager_scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`branch_id` text,
	`department_id` text
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`kind` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`actor` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`result` text NOT NULL,
	`received_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_tenant` ON `sync_operations` (`company_id`,`membership_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`must_change` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);