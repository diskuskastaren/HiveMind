import type { Decision } from '../types';

/** Older decisions did not have status or audit fields. Keep their IDs and links intact. */
export function upgradeDecision(decision: Decision): Decision {
  return {
    ...decision,
    status: decision.status || 'active',
    updatedAt: decision.updatedAt || decision.createdAt,
    relatedTaskIds: decision.relatedTaskIds || [],
    history: decision.history || [{ id: `${decision.id}:created`, timestamp: decision.createdAt,
      action: 'created', text: decision.text, status: decision.status || 'active' }],
  };
}
