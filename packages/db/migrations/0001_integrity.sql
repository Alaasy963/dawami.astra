-- Tenant references and append-only guarantees complement scoped repositories.
INSERT OR IGNORE INTO platform_settings(id,trial_days,monthly,yearly) VALUES(1,14,0,0);
CREATE UNIQUE INDEX one_open_session ON attendance_logs(company_id,membership_id) WHERE out_at IS NULL;
CREATE INDEX attendance_tenant_date ON attendance_logs(company_id,work_date,membership_id);
CREATE INDEX notifications_recipient ON notifications(company_id,recipient,created_at);
CREATE INDEX outbox_pending ON notification_outbox(status,next_at);
CREATE INDEX audit_tenant_date ON audit_logs(company_id,created_at);
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT,'audit_append_only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT,'audit_append_only'); END;
CREATE TRIGGER attendance_valid_time_insert BEFORE INSERT ON attendance_logs WHEN NEW.out_at IS NOT NULL AND NEW.out_at < NEW.in_at BEGIN SELECT RAISE(ABORT,'invalid_session_time'); END;
CREATE TRIGGER attendance_valid_time_update BEFORE UPDATE ON attendance_logs WHEN NEW.out_at IS NOT NULL AND NEW.out_at < NEW.in_at BEGIN SELECT RAISE(ABORT,'invalid_session_time'); END;
CREATE TRIGGER membership_branch_insert BEFORE INSERT ON memberships WHEN NEW.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM branches WHERE id=NEW.branch_id AND company_id=NEW.company_id) BEGIN SELECT RAISE(ABORT,'cross_tenant_branch'); END;
CREATE TRIGGER membership_branch_update BEFORE UPDATE ON memberships WHEN NEW.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM branches WHERE id=NEW.branch_id AND company_id=NEW.company_id) BEGIN SELECT RAISE(ABORT,'cross_tenant_branch'); END;
CREATE TRIGGER membership_department_insert BEFORE INSERT ON memberships WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM departments WHERE id=NEW.department_id AND company_id=NEW.company_id) BEGIN SELECT RAISE(ABORT,'cross_tenant_department'); END;
CREATE TRIGGER membership_department_update BEFORE UPDATE ON memberships WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM departments WHERE id=NEW.department_id AND company_id=NEW.company_id) BEGIN SELECT RAISE(ABORT,'cross_tenant_department'); END;
CREATE TRIGGER attendance_tenant BEFORE INSERT ON attendance_logs WHEN NOT EXISTS(SELECT 1 FROM memberships WHERE id=NEW.membership_id AND company_id=NEW.company_id) OR NOT EXISTS(SELECT 1 FROM branches WHERE id=NEW.branch_id AND company_id=NEW.company_id) BEGIN SELECT RAISE(ABORT,'cross_tenant_attendance'); END;
