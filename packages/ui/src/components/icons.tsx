import type { SVGProps } from "react";

export type GxIconName =
  | "home"
  | "playground"
  | "model"
  | "key"
  | "log"
  | "usage"
  | "routing"
  | "provider"
  | "credit"
  | "billing"
  | "security"
  | "audit"
  | "webhook"
  | "workspace"
  | "organization"
  | "environment"
  | "terminal"
  | "code"
  | "copy"
  | "filter"
  | "search"
  | "more"
  | "chevron"
  | "close"
  | "check"
  | "warning"
  | "critical";

const paths: Record<GxIconName, string[]> = {
  home: ["M3.5 9 10 3.5 16.5 9", "M5.5 8v8h9V8", "M8 16v-4h4v4"],
  playground: ["M5 3.5h10v13H5z", "m8 6-5 3 5 3z"],
  model: ["M4 5.5 10 2l6 3.5v9L10 18l-6-3.5z", "M4 5.5 10 9l6-3.5", "M10 9v9"],
  key: ["M8.5 11.5a4 4 0 1 1 2-3.5L17 8v3h-2v2h-2v2h-2"],
  log: ["M4 3h12v14H4z", "M7 7h6M7 10h6M7 13h4"],
  usage: ["M3 16h14", "M5 13V9M10 13V4M15 13V7"],
  routing: ["M4 5h5a3 3 0 0 1 3 3v7", "m9-3 3 3 3-3", "M4 15h3M4 10h3"],
  provider: ["M5 4h10v4H5zM5 12h10v4H5z", "M8 6h.01M8 14h.01"],
  credit: ["M3 6h14v9H3z", "M3 9h14M6 12h3"],
  billing: ["M6 3h8v14l-2-1-2 1-2-1-2 1z", "M8 7h4M8 10h4M8 13h2"],
  security: [
    "M10 2.5 16 5v4.5c0 3.8-2.4 6.4-6 8-3.6-1.6-6-4.2-6-8V5z",
    "m7.5 10 1.7 1.7 3.7-4",
  ],
  audit: ["M10 3a7 7 0 1 0 7 7", "M10 6v4l3 2", "m14 3 3 1-1 3"],
  webhook: [
    "M7 5a3 3 0 1 1-2.6 4.5M13 5a3 3 0 1 1 2.6 4.5M10 15a3 3 0 1 1 0-3",
  ],
  workspace: ["M3 5h6l2 2h6v9H3z"],
  organization: ["M10 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6M4 17a6 6 0 0 1 12 0"],
  environment: ["M10 2.5 17 6v8l-7 3.5L3 14V6z", "M3 6l7 3.5L17 6M10 9.5v8"],
  terminal: ["M3 4h14v12H3z", "m6 8 3 2-3 2M10 12h4"],
  code: ["m7 6-4 4 4 4m6-8 4 4-4 4M11 4 9 16"],
  copy: ["M7 7h10v10H7z", "M3 13V3h10"],
  filter: ["M3 5h14l-5.5 6v4l-3 2v-6z"],
  search: ["M8.5 3a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11M13 13l4 4"],
  more: ["M5 10h.01M10 10h.01M15 10h.01"],
  chevron: ["m7 5 5 5-5 5"],
  close: ["M5 5l10 10M15 5 5 15"],
  check: ["m4 10 4 4 8-8"],
  warning: ["M10 3 18 17H2z", "M10 8v4M10 15h.01"],
  critical: [
    "M5 5l10 10M15 5 5 15",
    "M10 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15",
  ],
};

export function GxIcon({
  name,
  size = 18,
  title,
  ...props
}: SVGProps<SVGSVGElement> & {
  name: GxIconName;
  size?: 16 | 18 | 20 | 24;
  title?: string;
}) {
  return (
    <svg
      {...props}
      className={`gx-icon ${props.className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      {paths[name].map((d) => (
        <path d={d} key={d} />
      ))}
    </svg>
  );
}
export const gxIconNames = Object.keys(paths) as GxIconName[];
