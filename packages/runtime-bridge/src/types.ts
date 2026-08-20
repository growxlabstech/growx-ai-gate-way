export class RuntimeBridgeError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "RuntimeBridgeError";
  }
}

export class ContractMismatchError extends RuntimeBridgeError {
  constructor(public mismatchType: string, message: string) {
    super("CONTRACT_MISMATCH", `Contract mismatch detected (${mismatchType}): ${message}`);
    this.name = "ContractMismatchError";
  }
}

export class CanaryRollbackError extends RuntimeBridgeError {
  constructor(reason: string) {
    super("CANARY_ROLLBACK", `Automated rollback triggered: ${reason}`);
    this.name = "CanaryRollbackError";
  }
}
