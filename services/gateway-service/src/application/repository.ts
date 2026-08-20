import type {
  GatewayAttemptEntity,
  GatewayErrorRecord,
  GatewayLatencyRecord,
  GatewayRequestEntity,
  GatewayUsageSnapshot,
} from "../domain/types.js";

export interface IGatewayRepository {
  createRequest(request: GatewayRequestEntity): Promise<void>;
  updateRequest(id: string, updates: Partial<GatewayRequestEntity>): Promise<void>;
  getRequest(id: string): Promise<GatewayRequestEntity | null>;
  saveUsageSnapshot(usage: GatewayUsageSnapshot): Promise<void>;
  saveLatencyRecord(latency: GatewayLatencyRecord): Promise<void>;
  saveErrorRecord(error: GatewayErrorRecord): Promise<void>;

  createAttempt(attempt: GatewayAttemptEntity): Promise<void>;
  updateAttempt(id: string, updates: Partial<GatewayAttemptEntity>): Promise<void>;
  listAttemptsByRequestId(requestId: string): Promise<GatewayAttemptEntity[]>;
  getAttempt(id: string): Promise<GatewayAttemptEntity | null>;
}
