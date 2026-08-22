import { randomBytes } from "node:crypto";
export type PublicIdPrefix =
  | "req"
  | "resp"
  | "msg"
  | "tool"
  | "evt"
  | "route"
  | "attempt"
  | "usage"
  | "model"
  | "provider"
  | "prov"
  | "key"
  | "pcred"
  | "audit"
  | "trace"
  | "sec"
  | "err"
  | "pol"
  | "rpv"
  | "dec"
  | "outbox"
  | "gwrq"
  | "gwatt"
  | "usevt"
  | "reconc"
  | "anl"
  | "anlsig"
  | "anlchk"
  | "toolv"
  | "tcall"
  | "tcont"
  | "texec"
  | "rschema"
  | "rsver";
export function createPublicId(prefix: PublicIdPrefix): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}
export function generateId(prefix: string = "id"): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}
