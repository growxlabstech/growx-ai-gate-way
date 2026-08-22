import { describe, it, expect } from "vitest";
import {
  ToolAuthorizationService,
  ToolAuthorizationError,
} from "../src/authorizer.js";

describe("Tool Authorization Service", () => {
  const authorizer = new ToolAuthorizationService();

  const mockContext = {
    organizationId: "org_123",
    workspaceId: "ws_456",
    requestId: "req_789",
    toolCallId: "tcall_001",
  };

  it("authorizes valid active tool matching tenant", () => {
    expect(() => {
      authorizer.authorizeExecution(
        {
          name: "query_docs",
          executionMode: "return_to_client",
          organizationId: "org_123",
          status: "active",
        },
        mockContext,
      );
    }).not.toThrow();
  });

  it("rejects tool belonging to different organization", () => {
    expect(() => {
      authorizer.authorizeExecution(
        {
          name: "private_tool",
          executionMode: "return_to_client",
          organizationId: "org_other",
          status: "active",
        },
        mockContext,
      );
    }).toThrow(ToolAuthorizationError);
  });

  it("enforces policy deny rule over tool name", () => {
    expect(() => {
      authorizer.authorizeExecution(
        {
          name: "risky_tool",
          executionMode: "platform_managed",
          organizationId: "org_123",
          status: "active",
        },
        mockContext,
        { deniedToolNames: ["risky_tool"] },
      );
    }).toThrow(/Policy explicitly denies/);
  });
});
