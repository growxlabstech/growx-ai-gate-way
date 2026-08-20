import { assertBalanced, type LedgerTransaction } from "@growx/ledger";
export interface SettlementCommand { idempotencyKey: string; usageRecordId: string; reservationId: string; walletId: string; credits: bigint; ledger: LedgerTransaction; }
export interface SettlementRepository { atomic(command: SettlementCommand): Promise<"settled" | "duplicate">; }
export async function settleUsage(command: SettlementCommand, repository: SettlementRepository): Promise<"settled" | "duplicate"> { if (command.credits < 0n) throw new Error("Credits cannot be negative"); assertBalanced(command.ledger); return repository.atomic(command); }
