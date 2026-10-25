CREATE UNIQUE INDEX one_identity_per_device ON memberships(company_id,device_hash) WHERE device_hash IS NOT NULL;
CREATE TRIGGER rebind_decide_once BEFORE UPDATE OF status ON device_rebind_requests WHEN OLD.status<>'pending' BEGIN SELECT RAISE(ABORT,'rebind_already_decided'); END;
CREATE TRIGGER rebind_supersede AFTER UPDATE OF status ON device_rebind_requests WHEN NEW.status='approved' BEGIN UPDATE device_rebind_requests SET status='superseded' WHERE company_id=NEW.company_id AND membership_id=NEW.membership_id AND id<>NEW.id AND status='pending'; END;
