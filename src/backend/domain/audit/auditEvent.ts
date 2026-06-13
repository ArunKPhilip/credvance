export interface AuditEvent {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  createdAt: string;
  metadataJson: string;
}
