export interface InvitationState {
  expiresAt: Date;
  acceptedAt?: Date | null;
  revokedAt?: Date | null;
}
export function canAcceptInvitation(
  invitation: InvitationState,
  now = new Date(),
): boolean {
  return (
    !invitation.acceptedAt &&
    !invitation.revokedAt &&
    invitation.expiresAt.getTime() > now.getTime()
  );
}
