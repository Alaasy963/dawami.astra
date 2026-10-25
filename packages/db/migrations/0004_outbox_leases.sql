ALTER TABLE `notification_outbox` ADD `lease_token` text;--> statement-breakpoint
ALTER TABLE `notification_outbox` ADD `lease_until` integer DEFAULT 0 NOT NULL;