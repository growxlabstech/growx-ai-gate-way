import { describe, it, expect } from "vitest";
import { EmbeddingBatchPlanner } from "../src/batch-planner.js";

describe("Embedding Batch Planner", () => {
  it("creates single chunk when input fits within limits", () => {
    const inputs = ["apple", "banana", "cherry"];
    const plan = EmbeddingBatchPlanner.plan(inputs, 10, 1000);
    expect(plan.chunks.length).toBe(1);
    expect(plan.chunks[0]!.inputs).toEqual(inputs);
    expect(plan.chunks[0]!.startIndex).toBe(0);
    expect(plan.chunks[0]!.endIndex).toBe(2);
  });

  it("splits into multiple chunks when items exceed maxChunkSize", () => {
    const inputs = ["a", "b", "c", "d", "e"];
    const plan = EmbeddingBatchPlanner.plan(inputs, 2, 1000);
    expect(plan.chunks.length).toBe(3);
    expect(plan.chunks[0]!.inputs).toEqual(["a", "b"]);
    expect(plan.chunks[0]!.startIndex).toBe(0);
    expect(plan.chunks[0]!.endIndex).toBe(1);

    expect(plan.chunks[1]!.inputs).toEqual(["c", "d"]);
    expect(plan.chunks[1]!.startIndex).toBe(2);
    expect(plan.chunks[1]!.endIndex).toBe(3);

    expect(plan.chunks[2]!.inputs).toEqual(["e"]);
    expect(plan.chunks[2]!.startIndex).toBe(4);
    expect(plan.chunks[2]!.endIndex).toBe(4);
  });

  it("splits into multiple chunks when token limits per chunk are reached", () => {
    const inputs = ["word ".repeat(50), "word ".repeat(50), "word ".repeat(50)];
    const plan = EmbeddingBatchPlanner.plan(inputs, 10, 60); // 60 tokens per chunk
    expect(plan.chunks.length).toBe(3);
  });
});
