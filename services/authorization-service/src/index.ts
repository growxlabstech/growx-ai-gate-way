import { createServer } from "node:http";
import {
  permissions,
  type BuiltInRole,
  type Permission,
} from "@growx/contracts";
import { AuthorizationError } from "@growx/shared";

export const serviceName = "authorization-service";
const allPermissions: readonly Permission[] = permissions;
export const rolePermissions: Readonly<
  Record<BuiltInRole, ReadonlySet<Permission>>
> = {
  organization_owner: new Set(allPermissions),
  organization_admin: new Set(
    allPermissions.filter(
      (permission) =>
        ![
          "organization.transferOwnership",
          "billing.manage",
          "pricing.manage",
          "credits.adjust",
          "payments.refund",
          "ledger.read",
          "reconciliation.manage",
        ].includes(permission),
    ),
  ),
  developer: new Set([
    "organization.read",
    "member.read",
    "workspace.read",
    "workspace.create",
    "workspace.update",
    "environment.create",
    "environment.update",
    "apiKey.read",
    "apiKey.create",
    "apiKey.update",
    "apiKey.revoke",
    "apiKey.rotate",
    "model.read",
    "provider.read",
    "usage.read",
    "logs.read",
    "webhook.read",
    "webhook.manage",
    "notification.read",
    "serviceAccount.read",
    "export.create",
    "export.read",
    "incident.read",
    "logs.replay",
  ]),
  billing_manager: new Set([
    "organization.read",
    "workspace.read",
    "billing.read",
    "billing.manage",
    "usage.read",
    "pricing.read",
    "credits.read",
    "payments.read",
    "invoices.read",
    "invoices.manage",
    "reconciliation.read",
  ]),
  viewer: new Set([
    "organization.read",
    "member.read",
    "workspace.read",
    "workspace.member.read",
    "model.read",
    "provider.read",
    "usage.read",
    "logs.read",
    "audit.read",
  ]),
};
export interface AuthorizationContext {
  userId: string;
  organizationId: string;
  workspaceId?: string;
  accountStatus: "active" | "invited" | "suspended" | "disabled" | "deleted";
  organizationStatus:
    "active" | "trial" | "restricted" | "suspended" | "archived";
  workspaceStatus?: "active" | "restricted" | "suspended" | "archived";
  roles: readonly BuiltInRole[];
}
export function hasPermission(
  context: AuthorizationContext,
  permission: Permission,
): boolean {
  if (
    context.accountStatus !== "active" ||
    ["suspended", "archived"].includes(context.organizationStatus) ||
    (context.workspaceStatus && context.workspaceStatus !== "active")
  )
    return false;
  return context.roles.some((role) => rolePermissions[role].has(permission));
}
export async function requirePermission(
  input: AuthorizationContext & { permission: Permission },
): Promise<void> {
  if (!hasPermission(input, input.permission))
    throw new AuthorizationError(
      "You do not have permission to perform this action.",
    );
}
export function createApp() {
  return createServer((request, response) => {
    if (["/health", "/live", "/ready"].includes(request.url ?? "")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          status: "ok",
          service: serviceName,
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }
    response.writeHead(404).end();
  });
}
if (process.env.NODE_ENV !== "test")
  createApp().listen(Number(process.env.PORT ?? 4003));
