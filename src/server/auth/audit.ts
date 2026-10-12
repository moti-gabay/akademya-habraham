import type { Db } from "../db/client";
import { auditLog } from "../db/schema";

export type AuditEntry = {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  diff?: unknown;
  ip?: string | null;
};

// Every admin mutation records who changed what.
export async function writeAudit(db: Db, entry: AuditEntry) {
  await db.insert(auditLog).values(entry);
}
