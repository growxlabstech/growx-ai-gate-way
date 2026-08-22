import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./primitives";
import { Button, IconButton, Select, Textarea } from "./controls";
import { Badge } from "./status";
import { KeyValue } from "./data";
export function InlineCode(props: HTMLAttributes<HTMLElement>) {
  return <code {...props} className={cx("gx-inline-code", props.className)} />;
}
export function CopyButton({ label = "Copy" }: { label?: string }) {
  return <IconButton icon="copy" label={label} variant="ghost" size="xs" />;
}
export function CodeBlock({
  language = "text",
  code,
}: {
  language?: string;
  code: string;
}) {
  return (
    <figure className="gx-code-block">
      <figcaption>
        <span>{language}</span>
        <CopyButton label={`Copy ${language}`} />
      </figcaption>
      <pre>
        <code>{code}</code>
      </pre>
    </figure>
  );
}
export function JsonViewer({ value }: { value: unknown }) {
  return <CodeBlock language="JSON" code={JSON.stringify(value, null, 2)} />;
}
export function ResponseViewer({
  status = "200 OK",
  children,
}: {
  status?: string;
  children: ReactNode;
}) {
  return (
    <section className="gx-response-viewer">
      <header>
        <strong>Response</strong>
        <Badge tone="health">{status}</Badge>
      </header>
      {children}
    </section>
  );
}
export function RequestInspector({
  requestId = "req_01J9GROWX",
  children,
}: {
  requestId?: string;
  children?: ReactNode;
}) {
  return (
    <section className="gx-request-inspector">
      <header>
        <div>
          <span>Request</span>
          <code>{requestId}</code>
        </div>
        <Badge tone="health">Completed</Badge>
      </header>
      <nav>
        {[
          "Overview",
          "Timing",
          "Routing",
          "Usage",
          "Request",
          "Response",
          "Error",
          "Events",
        ].map((tab, index) => (
          <button type="button" aria-pressed={index === 0} key={tab}>
            {tab}
          </button>
        ))}
      </nav>
      {children ?? (
        <KeyValue
          items={[
            { label: "Model", value: "growx/smart" },
            { label: "Total latency", value: "342ms", technical: true },
            { label: "Input tokens", value: "824", technical: true },
            { label: "Output tokens", value: "213", technical: true },
          ]}
        />
      )}
    </section>
  );
}
export function ApiKeySecretDialog({
  prefix = "gx_live_key_01",
  secret = "••••••••••••••••",
}: {
  prefix?: string;
  secret?: string;
}) {
  return (
    <section className="gx-secret-dialog">
      <Badge tone="warning">Shown once</Badge>
      <h3>Copy your API key</h3>
      <p>Store this key securely. GrowX cannot show it again.</p>
      <div>
        <code>
          {prefix}_{secret}
        </code>
        <CopyButton label="Copy API key" />
      </div>
    </section>
  );
}
export function ModelSelector({
  models = ["growx/fast", "growx/smart", "growx/reasoning"],
}: {
  models?: string[];
}) {
  return (
    <label className="gx-model-selector">
      <span>Model</span>
      <Select defaultValue={models[1]}>
        {models.map((model) => (
          <option key={model}>{model}</option>
        ))}
      </Select>
    </label>
  );
}
export function PlaygroundInput() {
  return (
    <section className="gx-playground-input">
      <Textarea rows={8} placeholder="Ask GrowX anything…" />
      <footer>
        <span>0 tokens</span>
        <Button variant="primary">Run</Button>
      </footer>
    </section>
  );
}
export function StreamingOutput({
  children = "Output will stream here.",
}: {
  children?: ReactNode;
}) {
  return (
    <section className="gx-streaming-output" aria-live="polite">
      <header>
        <span>Output</span>
        <Button size="xs">Stop</Button>
      </header>
      <div>{children}</div>
      <footer>
        <code>Request ID · —</code>
        <span>TTFT · —</span>
        <span>Latency · —</span>
      </footer>
    </section>
  );
}
