export interface SessionState {
  expiresAt: Date;
  revokedAt?: Date;
  userStatus: "active" | "invited" | "suspended" | "disabled" | "deleted";
}
export function isSessionActive(
  session: SessionState,
  now = new Date(),
): boolean {
  return (
    session.userStatus === "active" &&
    !session.revokedAt &&
    session.expiresAt.getTime() > now.getTime()
  );
}
export const secureCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: true,
  path: "/",
};
