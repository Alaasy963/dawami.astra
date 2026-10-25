DROP INDEX `push_subscriptions_endpoint_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `push_membership_endpoint` ON `push_subscriptions` (`company_id`,`membership_id`,`endpoint`);