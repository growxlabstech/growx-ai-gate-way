import {
  type RouteTrafficControl,
  type RouteTrafficMode,
} from "@growx/contracts";
import { generateId } from "@growx/ids";
import type { MachineAuthContext } from "@growx/api-key-service";
import type { RoutingStateSnapshotService } from "./routing-state-snapshot-service.js";

export class RouteManagementService {
  constructor(
    private readonly snapshotService: RoutingStateSnapshotService,
    private readonly auditService?: any | undefined,
    private readonly notificationService?: any | undefined,
  ) {}

  public async getRouteControl(
    routeId: string,
  ): Promise<RouteTrafficControl | null> {
    return this.snapshotService.getTrafficControl(routeId) ?? null;
  }

  public async listRouteControls(): Promise<RouteTrafficControl[]> {
    return this.snapshotService.listTrafficControls();
  }

  public async setTrafficControl(
    auth: MachineAuthContext,
    routeId: string,
    mode: RouteTrafficMode,
    options?: { maxTrafficPercent?: number; reason?: string },
  ): Promise<RouteTrafficControl> {
    const existing = this.snapshotService.getTrafficControl(routeId);
    const now = new Date();

    const control: RouteTrafficControl = {
      id: existing?.id ?? generateId("rtc"),
      routeId,
      mode,
      maxTrafficPercent:
        options?.maxTrafficPercent ?? (mode === "canary" ? 10 : 100),
      drain: mode === "draining",
      disabled: mode === "disabled",
      ...(options?.reason ? { reason: options.reason } : {}),
      updatedBy: auth.apiKeyId,
      version: (existing?.version ?? 0) + 1,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.snapshotService.setTrafficControl(routeId, control);

    if (this.auditService) {
      const action =
        mode === "disabled"
          ? "routing.kill_switch.used"
          : mode === "draining"
            ? "routing.route.draining"
            : "routing.traffic.changed";

      await this.auditService.recordEvent?.({
        action,
        organizationId: auth.organizationId,
        workspaceId: auth.workspaceId,
        actorId: auth.apiKeyId,
        metadata: {
          routeId,
          mode,
          percent: control.maxTrafficPercent,
          reason: options?.reason,
        },
      });
    }

    if (mode === "disabled" && this.notificationService) {
      await this.notificationService.dispatchInternalAlert?.({
        level: "warning",
        title: `Route '${routeId}' disabled via kill-switch`,
        message: options?.reason || "Operator disabled route traffic",
      });
    }

    return control;
  }

  public async drainRoute(
    auth: MachineAuthContext,
    routeId: string,
    reason?: string,
  ): Promise<RouteTrafficControl> {
    return this.setTrafficControl(
      auth,
      routeId,
      "draining",
      reason ? { reason } : undefined,
    );
  }

  public async disableRoute(
    auth: MachineAuthContext,
    routeId: string,
    reason?: string,
  ): Promise<RouteTrafficControl> {
    return this.setTrafficControl(
      auth,
      routeId,
      "disabled",
      reason ? { reason } : undefined,
    );
  }

  public async enableRoute(
    auth: MachineAuthContext,
    routeId: string,
  ): Promise<RouteTrafficControl> {
    return this.setTrafficControl(auth, routeId, "active", {
      maxTrafficPercent: 100,
    });
  }

  public async setCanaryTraffic(
    auth: MachineAuthContext,
    routeId: string,
    percent: number,
  ): Promise<RouteTrafficControl> {
    return this.setTrafficControl(auth, routeId, "canary", {
      maxTrafficPercent: percent,
    });
  }
}
