export interface InvitationState { expiresAt: Date; acceptedAt?: Date; revokedAt?: Date; }
export function canAcceptInvitation(invitation: InvitationState, now = new Date()): boolean { return !invitation.acceptedAt && !invitation.revokedAt && invitation.expiresAt.getTime() > now.getTime(); }
