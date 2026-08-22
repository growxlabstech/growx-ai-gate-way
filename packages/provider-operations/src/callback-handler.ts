import type { IProviderOperationRepository } from "./repository.js";
import type { ProviderOperationAdapter } from "./adapters/provider-operation-adapter.js";
import type { ProviderOperationFinalizer } from "./finalizer.js";
import { ProviderOperationStateMachine } from "./state-machine.js";
import { CallbackAuthError } from "./types.js";

export class ProviderOperationCallbackHandler {
  private adapters = new Map<string, ProviderOperationAdapter>();

  constructor(
    private repository: IProviderOperationRepository,
    private finalizer?: ProviderOperationFinalizer,
  ) {}

  public registerAdapter(adapter: ProviderOperationAdapter): void {
    this.adapters.set(adapter.providerId, adapter);
  }

  public async handleCallback(
    providerId: string,
    payload: Record<string, unknown>,
    headers: Record<string, string>,
    expectedSecret?: string,
  ): Promise<{ handled: boolean; operationId?: string; status?: string }> {
    // Optional secret verification
    if (expectedSecret) {
      const authHeader =
        headers["authorization"] || headers["x-provider-signature"];
      if (!authHeader || !authHeader.includes(expectedSecret)) {
        throw new CallbackAuthError(
          "Invalid or missing callback signature header",
        );
      }
    }

    const adapter = this.adapters.get(providerId);
    if (!adapter || !adapter.parseCallback) {
      return { handled: false };
    }

    const parsed = adapter.parseCallback(payload, headers);
    const op = await this.repository.getByProviderOperationId(
      providerId,
      parsed.providerOperationId,
    );
    if (!op) {
      return { handled: false };
    }

    // Out-of-order protection: never regress terminal states
    if (ProviderOperationStateMachine.isTerminal(op.status)) {
      return { handled: true, operationId: op.id, status: op.status };
    }

    if (parsed.status === "completed") {
      ProviderOperationStateMachine.assertCanTransition(
        op.status,
        "finalizing",
      );
      await this.repository.update(op.id, {
        status: "finalizing",
        resultReference: parsed.resultReference || op.resultReference,
      });

      if (this.finalizer) {
        await this.finalizer.finalize(op.id).catch(() => {});
      }
    } else if (parsed.status === "failed") {
      ProviderOperationStateMachine.assertCanTransition(op.status, "failed");
      await this.repository.update(op.id, {
        status: "failed",
        errorCode: parsed.errorCode || "CALLBACK_REPORTED_FAILURE",
        errorMessage: parsed.errorMessage,
        failedAt: new Date(),
      });
    } else {
      if (
        ProviderOperationStateMachine.canTransition(op.status, parsed.status)
      ) {
        await this.repository.update(op.id, { status: parsed.status });
      }
    }

    return { handled: true, operationId: op.id, status: parsed.status };
  }
}
