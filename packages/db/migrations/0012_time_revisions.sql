ALTER TABLE `memberships` ADD `time_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `timesheets` ADD `source_revision` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER attendance_logs_time_revision_insert AFTER INSERT ON attendance_logs BEGIN UPDATE memberships SET time_revision=time_revision+1 WHERE id=NEW.membership_id AND company_id=NEW.company_id; END;

--> statement-breakpoint
CREATE TRIGGER attendance_logs_time_revision_update AFTER UPDATE ON attendance_logs BEGIN UPDATE memberships SET time_revision=time_revision+1 WHERE id=NEW.membership_id AND company_id=NEW.company_id; END;

--> statement-breakpoint
CREATE TRIGGER attendance_logs_time_revision_delete AFTER DELETE ON attendance_logs BEGIN UPDATE memberships SET time_revision=time_revision+1 WHERE id=OLD.membership_id AND company_id=OLD.company_id; END;

--> statement-breakpoint
CREATE TRIGGER manual_time_requests_time_revision_insert AFTER INSERT ON manual_time_requests BEGIN UPDATE memberships SET time_revision=time_revision+1 WHERE id=NEW.membership_id AND company_id=NEW.company_id; END;

--> statement-breakpoint
CREATE TRIGGER manual_time_requests_time_revision_update AFTER UPDATE ON manual_time_requests BEGIN UPDATE memberships SET time_revision=time_revision+1 WHERE id=NEW.membership_id AND company_id=NEW.company_id; END;

--> statement-breakpoint
CREATE TRIGGER manual_time_requests_time_revision_delete AFTER DELETE ON manual_time_requests BEGIN UPDATE memberships SET time_revision=time_revision+1 WHERE id=OLD.membership_id AND company_id=OLD.company_id; END;

--> statement-breakpoint
CREATE TRIGGER work_plan_versions_time_revision_insert AFTER INSERT ON work_plan_versions BEGIN UPDATE memberships SET time_revision=time_revision+1 WHERE id=NEW.membership_id AND company_id=NEW.company_id; END;

--> statement-breakpoint
CREATE TRIGGER work_plan_versions_time_revision_update AFTER UPDATE ON work_plan_versions BEGIN UPDATE memberships SET time_revision=time_revision+1 WHERE id=NEW.membership_id AND company_id=NEW.company_id; END;

--> statement-breakpoint
CREATE TRIGGER work_plan_versions_time_revision_delete AFTER DELETE ON work_plan_versions BEGIN UPDATE memberships SET time_revision=time_revision+1 WHERE id=OLD.membership_id AND company_id=OLD.company_id; END;

--> statement-breakpoint
CREATE TRIGGER sync_operations_time_revision_insert AFTER INSERT ON sync_operations BEGIN UPDATE memberships SET time_revision=time_revision+1 WHERE id=NEW.membership_id AND company_id=NEW.company_id; END;

--> statement-breakpoint
CREATE TRIGGER sync_operations_time_revision_update AFTER UPDATE ON sync_operations BEGIN UPDATE memberships SET time_revision=time_revision+1 WHERE id=NEW.membership_id AND company_id=NEW.company_id; END;

--> statement-breakpoint
CREATE TRIGGER sync_operations_time_revision_delete AFTER DELETE ON sync_operations BEGIN UPDATE memberships SET time_revision=time_revision+1 WHERE id=OLD.membership_id AND company_id=OLD.company_id; END;

--> statement-breakpoint
CREATE TRIGGER early_review_time_revision AFTER INSERT ON early_time_reviews BEGIN UPDATE memberships SET time_revision=time_revision+1 WHERE company_id=NEW.company_id AND id=(SELECT membership_id FROM attendance_logs WHERE id=NEW.session_id AND company_id=NEW.company_id); END;
--> statement-breakpoint
CREATE TRIGGER sheet_revision_insert BEFORE INSERT ON timesheets WHEN NEW.status<>'pending' OR NEW.source_revision<>(SELECT time_revision FROM memberships WHERE id=NEW.membership_id AND company_id=NEW.company_id) BEGIN SELECT RAISE(ABORT,'timesheet_conflict'); END;
--> statement-breakpoint
CREATE TRIGGER sheet_revision_update BEFORE UPDATE ON timesheets WHEN NEW.source_revision<>OLD.source_revision OR (NEW.status='approved' AND NEW.source_revision<>(SELECT time_revision FROM memberships WHERE id=NEW.membership_id AND company_id=NEW.company_id)) BEGIN SELECT RAISE(ABORT,'timesheet_conflict'); END;
