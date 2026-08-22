"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  CANONICAL_GROWX_MODELS,
  type ConsoleModelItem,
} from "../../lib/models-data";

export interface ModelSelectorProps {
  models?: ConsoleModelItem[];
  selectedModelId?: string;
  onSelect: (modelId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  name?: string;
}

export function ModelSelector({
  models = CANONICAL_GROWX_MODELS,
  selectedModelId = "growx/fast",
  onSelect,
  disabled = false,
  placeholder = "Select a model…",
  id: customId,
  name,
}: ModelSelectorProps) {
  const autoId = useId();
  const selectorId = customId ?? autoId;
  const listboxId = `${selectorId}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const selectedModel = models.find(
    (m) => m.id === selectedModelId || m.canonicalId === selectedModelId,
  );

  const filteredModels = models.filter((m) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase().trim();
    return (
      m.id.toLowerCase().includes(term) ||
      m.displayName.toLowerCase().includes(term) ||
      m.family.toLowerCase().includes(term)
    );
  });

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      const initialIdx = filteredModels.findIndex(
        (m) =>
          m.id === selectedModelId &&
          m.isAvailableInWorkspace &&
          m.status === "active",
      );
      setHighlightedIndex(initialIdx >= 0 ? initialIdx : 0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 30);
    }
  }, [isOpen, selectedModelId]);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    const timer = setTimeout(() => {
      document.addEventListener("pointerdown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  }, [isOpen]);

  function handleTriggerKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (
      e.key === "ArrowDown" ||
      e.key === "ArrowUp" ||
      e.key === "Enter" ||
      e.key === " "
    ) {
      e.preventDefault();
      setIsOpen(true);
    }
  }

  function handleListboxKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) return;

    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        let next = prev + 1;
        while (
          next < filteredModels.length &&
          (!filteredModels[next]?.isAvailableInWorkspace ||
            filteredModels[next]?.status === "disabled")
        ) {
          next++;
        }
        return next < filteredModels.length ? next : prev;
      });
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        let next = prev - 1;
        while (
          next >= 0 &&
          (!filteredModels[next]?.isAvailableInWorkspace ||
            filteredModels[next]?.status === "disabled")
        ) {
          next--;
        }
        return next >= 0 ? next : prev;
      });
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const target = filteredModels[highlightedIndex];
      if (
        target &&
        target.isAvailableInWorkspace &&
        target.status !== "disabled"
      ) {
        onSelect(target.id);
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
  }

  function handleSelectOption(model: ConsoleModelItem) {
    if (!model.isAvailableInWorkspace || model.status === "disabled") {
      return; // Cannot select disabled or unavailable models
    }
    onSelect(model.id);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div
      ref={containerRef}
      className={`model-selector-container ${disabled ? "is-disabled" : ""}`}
    >
      {name ? (
        <input type="hidden" name={name} value={selectedModel?.id ?? ""} />
      ) : null}

      <button
        ref={triggerRef}
        id={selectorId}
        type="button"
        className={`model-selector-trigger ${isOpen ? "is-open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        {selectedModel ? (
          <div className="trigger-content">
            <span className="trigger-icon" aria-hidden="true">
              ◈
            </span>
            <div className="trigger-text">
              <span className="trigger-model-id">{selectedModel.id}</span>
              <span className="trigger-family">
                {selectedModel.family} · {selectedModel.contextWindowFormatted}
              </span>
            </div>
          </div>
        ) : (
          <span className="trigger-placeholder">{placeholder}</span>
        )}
        <span className="trigger-arrow" aria-hidden="true">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      {isOpen ? (
        <div className="model-selector-dropdown" role="presentation">
          <div className="dropdown-search-wrap">
            <input
              ref={searchInputRef}
              type="text"
              className="dropdown-search-input"
              placeholder="Search models or providers…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleListboxKeyDown}
              aria-label="Filter models"
            />
          </div>

          <ul
            ref={listboxRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-labelledby={selectorId}
            className="model-options-list"
          >
            {filteredModels.length === 0 ? (
              <li className="no-options-item" role="status">
                No models match "{search}"
              </li>
            ) : (
              filteredModels.map((model, index) => {
                const isSelected = model.id === selectedModelId;
                const isHighlighted = index === highlightedIndex;
                const isAvailable =
                  model.isAvailableInWorkspace && model.status !== "disabled";
                const isDeprecated = model.status === "deprecated";

                return (
                  <li
                    key={model.id}
                    id={`${selectorId}-opt-${model.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={!isAvailable}
                    className={`model-option-item ${isSelected ? "is-selected" : ""} ${
                      isHighlighted ? "is-highlighted" : ""
                    } ${!isAvailable ? "is-unavailable" : ""}`}
                    onClick={() => handleSelectOption(model)}
                    onMouseEnter={() => {
                      if (isAvailable) setHighlightedIndex(index);
                    }}
                  >
                    <div className="option-main">
                      <div className="option-title-row">
                        <code className="option-model-id">{model.id}</code>
                        <div className="option-badges">
                          <span className="option-family-badge">
                            {model.family}
                          </span>
                          {isDeprecated ? (
                            <span className="option-dep-badge">Deprecated</span>
                          ) : null}
                          {!isAvailable ? (
                            <span className="option-lock-badge">
                              Unavailable
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="option-meta-row">
                        <span>{model.displayName}</span>
                        <span>·</span>
                        <span>{model.contextWindowFormatted} context</span>
                      </div>
                    </div>

                    {isSelected ? (
                      <span className="option-check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
