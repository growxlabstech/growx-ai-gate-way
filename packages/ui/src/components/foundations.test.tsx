// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button, Checkbox, Radio } from "./controls";
import { Tab, Tabs } from "./navigation";
import { Modal } from "./overlays";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(element: ReactNode) {
  act(() => root.render(element));
}

function key(element: Element, value: string) {
  act(() => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: value, bubbles: true }),
    );
  });
}

describe("selection foundations", () => {
  it("toggles a checkbox from its label and emits its checked state", () => {
    render(<Checkbox label="Streaming" value="streaming" />);

    const checkbox = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    const label = container.querySelector("label")!;

    act(() => label.click());
    expect(checkbox.checked).toBe(true);

    checkbox.focus();
    act(() => checkbox.click());
    expect(checkbox.checked).toBe(false);
  });

  it("emits only the selected radio value", () => {
    render(
      <>
        <Radio label="Fast" name="model" value="fast" defaultChecked />
        <Radio label="Smart" name="model" value="smart" />
      </>,
    );

    const radios = container.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]',
    );
    act(() => radios[1]!.click());

    expect(radios[0]!.checked).toBe(false);
    expect(radios[1]!.checked).toBe(true);
    expect(radios[1]!.value).toBe("smart");
  });
});

describe("action foundations", () => {
  it("prevents duplicate button activation while loading", () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save policy
      </Button>,
    );

    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    act(() => button.click());
    expect(onClick).not.toHaveBeenCalled();
  });

  it("moves tab focus with arrow, Home, and End keys", () => {
    render(
      <Tabs label="Model details">
        <Tab active>Overview</Tab>
        <Tab>Capabilities</Tab>
        <Tab>Pricing</Tab>
      </Tabs>,
    );

    const tabs = container.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[0]!.focus();
    key(tabs[0]!, "ArrowRight");
    expect(document.activeElement).toBe(tabs[1]);
    key(tabs[1]!, "End");
    expect(document.activeElement).toBe(tabs[2]);
    key(tabs[2]!, "Home");
    expect(document.activeElement).toBe(tabs[0]);
  });
});

describe("overlay foundations", () => {
  it("names the dialog and closes with Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open title="Workspace settings" onClose={onClose}>
        <button type="button">Save</button>
      </Modal>,
    );

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const titleId = dialog.getAttribute("aria-labelledby")!;
    expect(document.getElementById(titleId)?.textContent).toBe(
      "Workspace settings",
    );

    key(dialog, "Escape");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
