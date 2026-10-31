ALTER TABLE `companies` ADD `overtime_percent` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `weekend_days` text DEFAULT '[4]' NOT NULL;
--> statement-breakpoint
CREATE TRIGGER company_time_revision AFTER UPDATE OF overtime_percent,timezone ON companies WHEN NEW.overtime_percent<>OLD.overtime_percent OR NEW.timezone<>OLD.timezone BEGIN UPDATE memberships SET time_revision=time_revision+1 WHERE company_id=NEW.id; END;
