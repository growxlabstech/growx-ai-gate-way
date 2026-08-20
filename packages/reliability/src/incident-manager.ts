import type { PlatformIncident, IncidentSeverity, IncidentStatus } from "@growx/contracts";
import { generateId } from "@growx/ids";

export class PlatformIncidentManager {
  private incidents = new Map<string, PlatformIncident>();

  public createIncident(options: {
    severity: IncidentSeverity;
    scope: string;
    summary: string;
    mitigationActions?: string[];
  }): PlatformIncident {
    const id = generateId("inc");
    const incident: PlatformIncident = {
      id,
      severity: options.severity,
      scope: options.scope,
      status: "investigating",
      summary: options.summary,
      mitigationActions: options.mitigationActions || [],
      startedAt: new Date(),
    };
    this.incidents.set(id, incident);
    return { ...incident };
  }

  public updateStatus(
    id: string,
    status: IncidentStatus,
    extraMitigation?: string
  ): PlatformIncident {
    const inc = this.incidents.get(id);
    if (!inc) throw new Error(`Incident '${id}' not found`);

    const updated = {
      ...inc,
      status,
      mitigationActions: extraMitigation
        ? [...inc.mitigationActions, extraMitigation]
        : inc.mitigationActions,
      resolvedAt: status === "resolved" ? new Date() : inc.resolvedAt,
    };
    this.incidents.set(id, updated);
    return { ...updated };
  }

  public getIncident(id: string): PlatformIncident | undefined {
    return this.incidents.get(id);
  }

  public listIncidents(activeOnly: boolean = false): PlatformIncident[] {
    return Array.from(this.incidents.values()).filter((i) => {
      if (activeOnly && i.status === "resolved") return false;
      return true;
    });
  }
}
