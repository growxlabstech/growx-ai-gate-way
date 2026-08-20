/* eslint-disable @typescript-eslint/no-explicit-any */
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createProviderCredentialRequestSchema,
  createProviderRequestSchema,
  GrowXProviderError,
  rotateProviderCredentialRequestSchema,
  updateProviderRequestSchema,
  createProviderAccountRequestSchema,
  updateProviderAccountRequestSchema,
  createProviderCredentialRequestV2Schema,
  createProviderCredentialVersionRequestSchema,
  rotateProviderCredentialRequestV2Schema,
  createProviderPoolRequestSchema,
  addPoolMemberRequestSchema,
  setAccountCapabilityRequestSchema,
  setAccountLimitRequestSchema,
} from "@growx/contracts";
import type { ProviderService } from "../application/provider-service.js";
import { toCredentialMetadata, toProviderRecord } from "../domain/serializers.js";
import {
  requirePrivilegedCapability,
  type IPrivilegedSessionResolver,
} from "./privileged-auth.js";
import type { ProviderAccountService } from "../vault/provider-account-service.js";
import type { ProviderCredentialVaultService } from "../vault/provider-credential-vault-service.js";
import type { ProviderPoolService } from "../vault/provider-pool-service.js";
import type { SecretReconciliationWorker } from "../vault/secret-reconciler.js";
import type { SecretProvider } from "../vault/secret-provider.js";

function readJsonBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        reject(new GrowXProviderError("provider_invalid_request", "Payload too large", false, 413));
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new GrowXProviderError("provider_invalid_request", "Malformed JSON body", false, 400));
      }
    });
    req.on("error", reject);
  });
}

export interface HttpHandlerOptions {
  providerService: ProviderService;
  sessionResolver: IPrivilegedSessionResolver;
  accountService?: ProviderAccountService | undefined;
  vaultService?: ProviderCredentialVaultService | undefined;
  poolService?: ProviderPoolService | undefined;
  reconciler?: SecretReconciliationWorker | undefined;
  secretProvider?: SecretProvider | undefined;
  serviceName?: string | undefined;
}

export function createHttpHandler(
  optionsOrService: ProviderService | HttpHandlerOptions,
  sessionResolver?: IPrivilegedSessionResolver,
  serviceName = "provider-service"
) {
  let providerService: ProviderService;
  let sResolver: IPrivilegedSessionResolver;
  let accountService: ProviderAccountService | undefined;
  let vaultService: ProviderCredentialVaultService | undefined;
  let poolService: ProviderPoolService | undefined;
  let reconciler: SecretReconciliationWorker | undefined;
  let secretProvider: SecretProvider | undefined;
  let sName = serviceName;

  if ("providerService" in optionsOrService) {
    providerService = optionsOrService.providerService;
    sResolver = optionsOrService.sessionResolver;
    accountService = optionsOrService.accountService;
    vaultService = optionsOrService.vaultService;
    poolService = optionsOrService.poolService;
    reconciler = optionsOrService.reconciler;
    secretProvider = optionsOrService.secretProvider;
    if (optionsOrService.serviceName) sName = optionsOrService.serviceName;
  } else {
    providerService = optionsOrService;
    sResolver = sessionResolver!;
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const urlObj = new URL(req.url ?? "/", "http://localhost");
    const pathname = urlObj.pathname.replace(/\/+$/, "") || "/";
    const method = req.method?.toUpperCase() ?? "GET";

    // -------------------------------------------------------------
    // Health Probes
    // -------------------------------------------------------------
    if (pathname === "/health" || pathname === "/live" || pathname === "/ready") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          service: sName,
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    try {
      // -------------------------------------------------------------
      // Provider Management Plane
      // -------------------------------------------------------------

      // GET /internal/providers
      if (pathname === "/internal/providers" && method === "GET") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.read", sResolver);
        if (!auth) return;
        const providers = await providerService.listProviders();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ items: providers.map(toProviderRecord) }));
        return;
      }

      // POST /internal/providers
      if (pathname === "/internal/providers" && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.manage", sResolver);
        if (!auth) return;
        const body = await readJsonBody(req);
        const input = createProviderRequestSchema.parse(body);
        const created = await providerService.createProvider(input, auth.operatorId);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ provider: toProviderRecord(created) }));
        return;
      }

      
      // POST /internal/providers/:providerId/credentials
      const provCredMatch = pathname.match(/^\/internal\/providers\/([^\/]+)\/credentials$/);
      if (provCredMatch && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.provider_credentials.manage", sResolver);
        if (!auth) return;
        const providerId = provCredMatch[1]!;
        const body = await readJsonBody(req);
        const input = createProviderCredentialRequestSchema.parse(body);
        const created = await providerService.createCredential(providerId, input, auth.operatorId);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify({ credential: toCredentialMetadata(created) }));
        return;
      }

      // -------------------------------------------------------------
      // Phase 28: Provider Accounts Plane
      // -------------------------------------------------------------

      // GET /internal/providers/:providerId/accounts
      const provAccountsMatch = pathname.match(/^\/internal\/providers\/([^\/]+)\/accounts$/);
      if (provAccountsMatch && method === "GET") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.read", sResolver);
        if (!auth) return;
        const providerId = provAccountsMatch[1]!;
        const accounts = accountService
          ? await accountService.listAccounts(providerId)
          : [];
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ items: accounts }));
        return;
      }

      // POST /internal/providers/:providerId/accounts
      if (provAccountsMatch && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.manage", sResolver);
        if (!auth) return;
        const providerId = provAccountsMatch[1]!;
        const body = await readJsonBody(req);
        const input = createProviderAccountRequestSchema.parse(body);
        const created = accountService
          ? await accountService.createAccount(providerId, input, auth.operatorId)
          : ({} as any);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(created));
        return;
      }

      // GET /internal/provider-accounts/:id
      const accountMatch = pathname.match(/^\/internal\/provider-accounts\/([^\/]+)$/);
      if (accountMatch && method === "GET") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.read", sResolver);
        if (!auth) return;
        const accountId = accountMatch[1]!;
        const account = accountService ? await accountService.getAccount(accountId) : null;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(account));
        return;
      }

      // PATCH /internal/provider-accounts/:id
      if (accountMatch && method === "PATCH") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.manage", sResolver);
        if (!auth) return;
        const accountId = accountMatch[1]!;
        const body = await readJsonBody(req);
        const input = updateProviderAccountRequestSchema.parse(body);
        const updated = accountService
          ? await accountService.updateAccount(accountId, input, auth.operatorId)
          : ({} as any);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(updated));
        return;
      }

      // POST /internal/provider-accounts/:id/drain
      const drainAccountMatch = pathname.match(/^\/internal\/provider-accounts\/([^\/]+)\/drain$/);
      if (drainAccountMatch && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.manage", sResolver);
        if (!auth) return;
        const accountId = drainAccountMatch[1]!;
        const updated = accountService
          ? await accountService.drainAccount(accountId, auth.operatorId)
          : ({} as any);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(updated));
        return;
      }

      // POST /internal/provider-accounts/:id/disable
      const disableAccountMatch = pathname.match(/^\/internal\/provider-accounts\/([^\/]+)\/disable$/);
      if (disableAccountMatch && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.manage", sResolver);
        if (!auth) return;
        const accountId = disableAccountMatch[1]!;
        const updated = accountService
          ? await accountService.disableAccount(accountId, auth.operatorId)
          : ({} as any);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(updated));
        return;
      }

      // POST /internal/provider-accounts/:id/enable
      const enableAccountMatch = pathname.match(/^\/internal\/provider-accounts\/([^\/]+)\/enable$/);
      if (enableAccountMatch && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.manage", sResolver);
        if (!auth) return;
        const accountId = enableAccountMatch[1]!;
        const updated = accountService
          ? await accountService.enableAccount(accountId, auth.operatorId)
          : ({} as any);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(updated));
        return;
      }

      // Capabilities: POST /internal/provider-accounts/:id/capabilities
      const capMatch = pathname.match(/^\/internal\/provider-accounts\/([^\/]+)\/capabilities$/);
      if (capMatch && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.manage", sResolver);
        if (!auth) return;
        const accountId = capMatch[1]!;
        const body = await readJsonBody(req);
        const input = setAccountCapabilityRequestSchema.parse(body);
        const cap = accountService ? await accountService.setCapability(accountId, input) : ({} as any);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(cap));
        return;
      }

      // Limits: POST /internal/provider-accounts/:id/limits
      const limitMatch = pathname.match(/^\/internal\/provider-accounts\/([^\/]+)\/limits$/);
      if (limitMatch && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.manage", sResolver);
        if (!auth) return;
        const accountId = limitMatch[1]!;
        const body = await readJsonBody(req);
        const input = setAccountLimitRequestSchema.parse(body);
        const lim = accountService ? await accountService.setLimit(accountId, input) : ({} as any);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(lim));
        return;
      }

      // -------------------------------------------------------------
      // Phase 28: Provider Credentials & Versions Plane
      // -------------------------------------------------------------

      // POST /internal/provider-accounts/:id/credentials
      const accCredMatch = pathname.match(/^\/internal\/provider-accounts\/([^\/]+)\/credentials$/);
      if (accCredMatch && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.provider_credentials.manage", sResolver);
        if (!auth) return;
        const accountId = accCredMatch[1]!;
        const body = await readJsonBody(req);
        const input = createProviderCredentialRequestV2Schema.parse(body);
        const result = vaultService
          ? await vaultService.createCredential(accountId, input, auth.operatorId)
          : ({} as any);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // POST /internal/provider-credentials/:id/versions
      const credVerMatch = pathname.match(/^\/internal\/provider-credentials\/([^\/]+)\/versions$/);
      if (credVerMatch && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.provider_credentials.manage", sResolver);
        if (!auth) return;
        const credentialId = credVerMatch[1]!;
        const body = await readJsonBody(req);
        const input = createProviderCredentialVersionRequestSchema.parse(body);
        const created = vaultService
          ? await vaultService.createVersion(credentialId, input, auth.operatorId)
          : ({} as any);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(created));
        return;
      }

      // POST /internal/provider-credential-versions/:id/activate
      const actVerMatch = pathname.match(/^\/internal\/provider-credential-versions\/([^\/]+)\/activate$/);
      if (actVerMatch && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.provider_credentials.rotate", sResolver);
        if (!auth) return;
        const versionId = actVerMatch[1]!;
        const result = vaultService
          ? await vaultService.activateVersion(versionId, auth.operatorId)
          : ({} as any);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // POST /internal/provider-credentials/:id/rotate
      const rotCredMatch = pathname.match(/^\/internal\/provider-credentials\/([^\/]+)\/rotate$/);
      if (rotCredMatch && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.provider_credentials.rotate", sResolver);
        if (!auth) return;
        const credentialId = rotCredMatch[1]!;
        const body = await readJsonBody(req);
        const input = rotateProviderCredentialRequestV2Schema.parse(body);
        const result = vaultService
          ? await vaultService.rotateCredential(credentialId, input, auth.operatorId)
          : ({} as any);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // POST /internal/provider-credentials/:id/revoke
      const revCredMatch = pathname.match(/^\/internal\/provider-credentials\/([^\/]+)\/revoke$/);
      if (revCredMatch && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.provider_credentials.manage", sResolver);
        if (!auth) return;
        const credentialId = revCredMatch[1]!;
        const body = await readJsonBody(req);
        const result = vaultService
          ? await vaultService.emergencyRevoke(credentialId, body.reason || "Emergency revocation", auth.operatorId)
          : ({} as any);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      // GET /internal/provider-credentials/expiring
      if (pathname === "/internal/provider-credentials/expiring" && method === "GET") {
        const auth = await requirePrivilegedCapability(req, res, "ops.provider_credentials.read", sResolver);
        if (!auth) return;
        const items = vaultService ? await vaultService.checkExpiringCredentials(14) : [];
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ items }));
        return;
      }

      // -------------------------------------------------------------
      // Phase 28: Provider Credential Pools Plane
      // -------------------------------------------------------------

      // GET /internal/provider-pools
      if (pathname === "/internal/provider-pools" && method === "GET") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.read", sResolver);
        if (!auth) return;
        const providerId = urlObj.searchParams.get("providerId") || undefined;
        const items = poolService ? await poolService.listPools(providerId) : [];
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ items }));
        return;
      }

      // POST /internal/provider-pools
      if (pathname === "/internal/provider-pools" && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.manage", sResolver);
        if (!auth) return;
        const body = await readJsonBody(req);
        const input = createProviderPoolRequestSchema.parse(body);
        const created = poolService ? await poolService.createPool(input, auth.operatorId) : ({} as any);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(created));
        return;
      }

      // POST /internal/provider-pools/:id/members
      const poolMemberMatch = pathname.match(/^\/internal\/provider-pools\/([^\/]+)\/members$/);
      if (poolMemberMatch && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.manage", sResolver);
        if (!auth) return;
        const poolId = poolMemberMatch[1]!;
        const body = await readJsonBody(req);
        const input = addPoolMemberRequestSchema.parse(body);
        const member = poolService ? await poolService.addMember(poolId, input, auth.operatorId) : ({} as any);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(member));
        return;
      }

      // DELETE /internal/provider-pools/:id/members/:memberId
      const delPoolMemberMatch = pathname.match(/^\/internal\/provider-pools\/([^\/]+)\/members\/([^\/]+)$/);
      if (delPoolMemberMatch && method === "DELETE") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.manage", sResolver);
        if (!auth) return;
        const poolId = delPoolMemberMatch[1]!;
        const memberId = delPoolMemberMatch[2]!;
        if (poolService) await poolService.removeMember(poolId, memberId, auth.operatorId);
        res.writeHead(204);
        res.end();
        return;
      }

      // -------------------------------------------------------------
      // Vault Health & Reconciliation
      // -------------------------------------------------------------

      // GET /internal/provider-vault/health
      if (pathname === "/internal/provider-vault/health" && method === "GET") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.read", sResolver);
        if (!auth) return;
        const h = secretProvider ? await secretProvider.health() : { status: "healthy" };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(h));
        return;
      }

      // POST /internal/provider-secrets/reconcile
      if (pathname === "/internal/provider-secrets/reconcile" && method === "POST") {
        const auth = await requirePrivilegedCapability(req, res, "ops.providers.manage", sResolver);
        if (!auth) return;
        const report = reconciler ? await reconciler.reconcile() : { scannedCount: 0, healthyCount: 0, missingVaultSecrets: [], orphanSecrets: [], reconciledAt: new Date() };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(report));
        return;
      }

      // 404 for unknown internal route
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not_found", message: "Resource not found" }));
    } catch (err: any) {
      const statusCode = err.status || err.statusCode || (err.name === "ZodError" ? 400 : 500);
      res.writeHead(statusCode, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: err.code || "internal_error",
          message: err.message || "An unexpected error occurred",
        })
      );
    }
  };
}
