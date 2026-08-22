"use client";

import { useEffect, useRef, useState } from "react";
import type { ConsoleModelItem } from "../../lib/models-data";
import type {
  ExecutionState,
  PlaygroundMessage,
  PlaygroundParameters,
  PlaygroundStructuredOutput,
  PlaygroundTelemetry,
  PlaygroundToolDefinition,
  StreamEventLog,
  ToolCallItem,
} from "../../lib/playground-types";
import { parseSseStream } from "../../lib/sse-stream-parser";
import { RequestComposer } from "./request-composer";
import { ResponseViewer } from "./response-viewer";
import { CodeExportModal } from "./code-export-modal";

interface PlaygroundViewProps {
  organizationSlug: string;
  workspaceSlug: string;
  workspaceId: string;
  models: ConsoleModelItem[];
}

export function PlaygroundView({
  organizationSlug,
  workspaceSlug,
  workspaceId,
  models,
}: PlaygroundViewProps) {
  // Model state
  const [selectedModelId, setSelectedModelId] = useState<string>(
    models.find((m) => m.id === "growx/fast")
      ? "growx/fast"
      : (models[0]?.id ?? "growx/fast"),
  );
  const selectedModel = models.find(
    (m) => m.id === selectedModelId || m.canonicalId === selectedModelId,
  ) ??
    models[0] ?? {
      id: "growx/fast",
      canonicalId: "growx/fast",
      displayName: "GrowX Fast",
      family: "GrowX",
      category: "chat",
      status: "active",
      description: "Default low-latency model",
      contextWindow: 128000,
      contextWindowFormatted: "128K",
      maxOutputTokens: 4096,
      maxOutputTokensFormatted: "4K",
      supportsStreaming: true,
      supportsTools: true,
      supportsStructuredOutput: true,
      supportsReasoning: false,
      inputModalities: ["text"],
      outputModalities: ["text"],
      capabilities: ["text.generate", "streaming", "tools.call"],
      pricingSummary: "$0.10 / 1M",
      isAvailableInWorkspace: true,
    };

  // Messages state
  const [messages, setMessages] = useState<PlaygroundMessage[]>([
    {
      id: "msg_initial",
      role: "user",
      content: "Hello GrowX AI Gateway!",
    },
  ]);

  // Parameters state
  const [parameters, setParameters] = useState<PlaygroundParameters>({
    temperature: 0.7,
    maxTokens: Math.min(2048, selectedModel.maxOutputTokens),
    topP: 1.0,
    stream: selectedModel.supportsStreaming,
    stop: [],
  });

  // Tools & Structured Output state
  const [tools, setTools] = useState<PlaygroundToolDefinition[]>([]);
  const [structuredOutput, setStructuredOutput] =
    useState<PlaygroundStructuredOutput>({
      enabled: false,
      name: "output_schema",
      strict: true,
      schemaJson:
        '{\n  "type": "object",\n  "properties": {\n    "result": { "type": "string" }\n  },\n  "required": ["result"]\n}',
      isValid: true,
    });

  // Execution & Telemetry state
  const [executionState, setExecutionState] = useState<ExecutionState>("idle");
  const [streamedText, setStreamedText] = useState("");
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);
  const [events, setEvents] = useState<StreamEventLog[]>([]);
  const [rawRequestJson, setRawRequestJson] = useState("");
  const [rawResponseJson, setRawResponseJson] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);

  const [telemetry, setTelemetry] = useState<PlaygroundTelemetry>({
    requestId: null,
    status: null,
    totalLatencyMs: null,
    ttftMs: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    cost: null,
    costFormatted: null,
    modelUsed: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Workspace Switch Isolation: Clean up on workspace change
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setExecutionState("idle");
    setStreamedText("");
    setToolCalls([]);
    setEvents([]);
    setErrorMessage(null);
    setErrorCode(null);
    setTelemetry({
      requestId: null,
      status: null,
      totalLatencyMs: null,
      ttftMs: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      cost: null,
      costFormatted: null,
      modelUsed: null,
    });

    // Revalidate selected model
    const isValidForWorkspace = models.some(
      (m) => m.id === selectedModelId && m.isAvailableInWorkspace,
    );
    if (!isValidForWorkspace && models.length > 0) {
      setSelectedModelId(models[0]?.id ?? "growx/fast");
    }
  }, [workspaceId]);

  // Keyboard shortcut: Cmd/Ctrl + Enter
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (executionState !== "submitting" && executionState !== "streaming") {
          handleRun();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    executionState,
    selectedModelId,
    messages,
    parameters,
    tools,
    structuredOutput,
  ]);

  function handleClear() {
    if (executionState === "submitting" || executionState === "streaming") {
      handleStop();
    }
    setMessages([
      {
        id: `msg_${Date.now()}`,
        role: "user",
        content: "",
      },
    ]);
    setStreamedText("");
    setToolCalls([]);
    setEvents([]);
    setErrorMessage(null);
    setErrorCode(null);
    setExecutionState("idle");
    setTelemetry({
      requestId: null,
      status: null,
      totalLatencyMs: null,
      ttftMs: null,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      cost: null,
      costFormatted: null,
      modelUsed: null,
    });
  }

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setExecutionState("cancelled");
  }

  async function handleRun() {
    if (executionState === "submitting" || executionState === "streaming")
      return;

    // Reset previous run output
    setExecutionState("submitting");
    setStreamedText("");
    setToolCalls([]);
    setEvents([]);
    setErrorMessage(null);
    setErrorCode(null);

    const startTime = Date.now();

    // Prepare abort controller
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Construct canonical request payload
    const payload: any = {
      model: selectedModel.id,
      messages: messages
        .filter((m) => m.content.trim() || m.attachment)
        .map((m) => {
          if (m.attachment?.dataUrl) {
            return {
              role: m.role,
              content: [
                { type: "text", text: m.content },
                { type: "image_url", image_url: { url: m.attachment.dataUrl } },
              ],
            };
          }
          return {
            role: m.role,
            content: m.content,
          };
        }),
      stream: parameters.stream,
      temperature: parameters.temperature,
      max_tokens: parameters.maxTokens,
      top_p: parameters.topP,
    };

    if (parameters.seed !== undefined) payload.seed = parameters.seed;
    if (parameters.stop.length > 0) payload.stop = parameters.stop;
    if (parameters.reasoningEffort && selectedModel.supportsReasoning) {
      payload.reasoning_effort = parameters.reasoningEffort;
    }

    const validTools = tools
      .filter((t) => t.name.trim() && t.isValid)
      .map((t) => {
        let params = {};
        try {
          params = JSON.parse(t.parametersJson);
        } catch {}
        return {
          type: "function",
          function: {
            name: t.name.trim(),
            description: t.description.trim(),
            parameters: params,
          },
        };
      });

    if (validTools.length > 0 && selectedModel.supportsTools) {
      payload.tools = validTools;
    }

    if (
      structuredOutput.enabled &&
      structuredOutput.isValid &&
      selectedModel.supportsStructuredOutput
    ) {
      let schema = {};
      try {
        schema = JSON.parse(structuredOutput.schemaJson);
      } catch {}
      payload.response_format = {
        type: "json_schema",
        json_schema: {
          name: structuredOutput.name.trim() || "response",
          strict: structuredOutput.strict,
          schema,
        },
      };
    }

    setRawRequestJson(JSON.stringify(payload, null, 2));

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/playground/execute`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: abortController.signal,
        },
      );

      const httpStatus = response.status;
      const initialReqId = response.headers.get("x-request-id");

      setTelemetry((prev) => ({
        ...prev,
        status: httpStatus,
        requestId: initialReqId ?? prev.requestId,
        modelUsed: selectedModel.id,
      }));

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({
          error: {
            message: `Request failed with status ${response.status}`,
            code: "http_error",
          },
        }));
        setExecutionState("failed");
        setErrorMessage(errorJson.error?.message ?? "Execution failed");
        setErrorCode(errorJson.error?.code ?? "gateway_error");
        setRawResponseJson(JSON.stringify(errorJson, null, 2));
        return;
      }

      if (parameters.stream) {
        await parseSseStream(
          response,
          {
            onStart: (reqId) => {
              if (reqId) {
                setTelemetry((prev) => ({ ...prev, requestId: reqId }));
              }
            },
            onDelta: (chunk, ttft) => {
              setExecutionState("streaming");
              setStreamedText((prev) => prev + chunk);
              if (ttft !== null) {
                setTelemetry((prev) => ({ ...prev, ttftMs: ttft }));
              }
            },
            onToolCallDelta: (tcs) => {
              setExecutionState("streaming");
              setToolCalls(tcs);
            },
            onUsage: (usage) => {
              const costVal =
                usage.cost ??
                (usage.totalTokens ? usage.totalTokens * 0.000003 : null);
              setTelemetry((prev) => ({
                ...prev,
                inputTokens: usage.inputTokens ?? prev.inputTokens,
                outputTokens: usage.outputTokens ?? prev.outputTokens,
                totalTokens: usage.totalTokens ?? prev.totalTokens,
                cost: costVal,
                costFormatted:
                  costVal !== null
                    ? `$${costVal.toFixed(6)}`
                    : prev.costFormatted,
              }));
            },
            onEvent: (evt) => {
              setEvents((prev) => [...prev, evt]);
            },
            onError: (err) => {
              setExecutionState("failed");
              setErrorMessage(err.message);
              setErrorCode(err.code ?? "stream_error");
            },
            onDone: (fullText, rawResp) => {
              const totalLatency = Date.now() - startTime;
              setExecutionState("completed");
              setRawResponseJson(JSON.stringify(rawResp, null, 2));
              setTelemetry((prev) => ({
                ...prev,
                totalLatencyMs: totalLatency,
                costFormatted: prev.costFormatted ?? "$0.000150",
              }));
            },
          },
          abortController.signal,
        );
        setExecutionState((curr) =>
          curr === "failed" || curr === "cancelled" ? curr : "completed",
        );
      } else {
        const json = await response.json();
        const totalLatency = Date.now() - startTime;
        setExecutionState("completed");
        setRawResponseJson(JSON.stringify(json, null, 2));

        const content = json.choices?.[0]?.message?.content ?? "";
        setStreamedText(content);

        const usage = json.usage;
        const costVal =
          usage?.cost ??
          (usage?.total_tokens ? usage.total_tokens * 0.000003 : null);

        setTelemetry((prev) => ({
          ...prev,
          totalLatencyMs: totalLatency,
          inputTokens: usage?.prompt_tokens ?? null,
          outputTokens: usage?.completion_tokens ?? null,
          totalTokens: usage?.total_tokens ?? null,
          cost: costVal,
          costFormatted:
            costVal !== null ? `$${costVal.toFixed(6)}` : "$0.000120",
        }));
      }
    } catch (err: any) {
      if (err.name === "AbortError" || abortController.signal.aborted) {
        setExecutionState("cancelled");
        return;
      }
      setExecutionState("failed");
      setErrorMessage(
        err.message ?? "Network error communicating with Gateway",
      );
      setErrorCode("network_error");
    } finally {
      abortControllerRef.current = null;
    }
  }

  return (
    <div className="playground-container" data-testid="playground-root">
      {/* Split Pane Engineering Layout */}
      <div className="playground-split-layout">
        {/* Left: Request Composer */}
        <RequestComposer
          models={models}
          selectedModel={selectedModel}
          onSelectModel={(id) => setSelectedModelId(id)}
          messages={messages}
          onMessagesChange={setMessages}
          parameters={parameters}
          onParametersChange={setParameters}
          tools={tools}
          onToolsChange={setTools}
          structuredOutput={structuredOutput}
          onStructuredOutputChange={setStructuredOutput}
          executionState={executionState}
          onRun={handleRun}
          onStop={handleStop}
          onClear={handleClear}
          onOpenCode={() => setIsCodeModalOpen(true)}
        />

        {/* Right: Response & Telemetry Viewer */}
        <ResponseViewer
          executionState={executionState}
          streamedText={streamedText}
          toolCalls={toolCalls}
          telemetry={telemetry}
          events={events}
          rawRequestJson={rawRequestJson}
          rawResponseJson={rawResponseJson}
          errorMessage={errorMessage}
          errorCode={errorCode}
        />
      </div>

      {/* Code Export Modal */}
      <CodeExportModal
        isOpen={isCodeModalOpen}
        onClose={() => setIsCodeModalOpen(false)}
        modelId={selectedModel.id}
        messages={messages}
        parameters={parameters}
        tools={tools}
        structuredOutput={structuredOutput}
      />
    </div>
  );
}
