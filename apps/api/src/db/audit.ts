import { db } from "./client.js";
import * as schema from "./schema.js";

export async function recordAudit(
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  meta?: Record<string, unknown>
) {
  try {
    await db.insert(schema.auditLog).values({
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      actorId,
      action,
      entity,
      entityId,
      metaJson: meta ? JSON.stringify(meta) : null,
    });
  } catch (err) {
    console.error("Failed to record audit log:", err);
  }
}

