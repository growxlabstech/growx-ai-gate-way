import { describe, it, expect, beforeEach } from "vitest";
import {
  ToolRegistryService,
  InMemoryToolRepository,
} from "../src/application/tool-registry.js";

describe("ToolRegistryService", () => {
  let service: ToolRegistryService;

  beforeEach(() => {
    service = new ToolRegistryService(new InMemoryToolRepository());
  });

  it("creates a tool with initial version", async () => {
    const entry = await service.createTool({
      organizationId: "org_1",
      key: "lookup_order",
      name: "Lookup Order",
      description: "Looks up order by ID",
      inputSchema: {
        type: "object",
        properties: { orderId: { type: "string" } },
        required: ["orderId"],
      },
      createdBy: "user_1",
    });

    expect(entry.tool.id).toMatch(/^tool_/);
    expect(entry.tool.key).toBe("lookup_order");
    expect(entry.tool.status).toBe("active");
    expect(entry.activeVersion.version).toBe(1);
  });

  it("rejects duplicate tool key in same scope", async () => {
    await service.createTool({
      organizationId: "org_1",
      key: "duplicate_tool",
      name: "Dup",
      inputSchema: { type: "object" },
      createdBy: "user_1",
    });

    await expect(
      service.createTool({
        organizationId: "org_1",
        key: "duplicate_tool",
        name: "Dup2",
        inputSchema: { type: "object" },
        createdBy: "user_1",
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("creates new version and updates activeVersion", async () => {
    const entry = await service.createTool({
      organizationId: "org_1",
      key: "versioned_tool",
      name: "Versioned",
      inputSchema: { type: "object", properties: { q: { type: "string" } } },
      createdBy: "user_1",
    });

    const v2 = await service.createVersion(entry.tool.id, {
      inputSchema: {
        type: "object",
        properties: { q: { type: "string" }, limit: { type: "number" } },
      },
      createdBy: "user_1",
    });

    expect(v2.version).toBe(2);

    const updated = await service.getTool(entry.tool.id);
    expect(updated!.activeVersion.version).toBe(2);
  });

  it("archives a tool", async () => {
    const entry = await service.createTool({
      organizationId: "org_1",
      key: "archivable",
      name: "Archivable",
      inputSchema: { type: "object" },
      createdBy: "user_1",
    });

    await service.archiveTool(entry.tool.id);

    const tools = await service.listTools("org_1", "active");
    expect(tools.find((t) => t.id === entry.tool.id)).toBeUndefined();
  });
});
