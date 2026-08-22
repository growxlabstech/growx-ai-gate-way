import { describe, it, expect } from "vitest";
import { PlatformIncidentManager } from "../src/incident-manager.js";

describe("PlatformIncidentManager", () => {
  const manager = new PlatformIncidentManager();

  it("manages incident lifecycle from investigation to resolution", () => {
    const inc = manager.createIncident({
      severity: "SEV1",
      scope: "postgres",
      summary: "PostgreSQL connection pool exhaustion",
      mitigationActions: ["Scale connection pooler", "Set read-only mode"],
    });

    expect(inc.status).toBe("investigating");
    expect(inc.mitigationActions.length).toBe(2);

    const updated = manager.updateStatus(
      inc.id,
      "resolved",
      "Pool restarted and mode restored",
    );
    expect(updated.status).toBe("resolved");
    expect(updated.resolvedAt).toBeDefined();
    expect(updated.mitigationActions.length).toBe(3);
  });
});
