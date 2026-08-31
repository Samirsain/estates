-- Security Logs & Alerts removed. Identity reveals are now recorded on AuditEvent.
DROP TABLE IF EXISTS "SecurityEvent";
DROP TYPE IF EXISTS "SecurityEventType";
