export const emailTemplates = {
  "auth-otp": {
    subject: "Your GrowX AI verification code",
    body: "GrowX AI\n\nYour verification code\n\n{{otp}}\n\nThis code expires in {{expiresInMinutes}} minutes.\n\nIf you did not request this code, you can ignore this email.",
  },
  "verify-email": {
    subject: "Verify your GrowX AI email",
    body: "Verify your email: {{url}}",
  },
  "reset-password": {
    subject: "Reset your GrowX AI password",
    body: "Reset your password: {{url}}",
  },
  "organization-invitation": {
    subject: "You’re invited to GrowX AI",
    body: "Accept your invitation: {{url}}",
  },
  "invitation-accepted": {
    subject: "Invitation accepted",
    body: "{{name}} accepted your invitation.",
  },
  "role-changed": {
    subject: "Your GrowX AI role changed",
    body: "Your role is now {{role}}.",
  },
  "member-removed": {
    subject: "Organization access removed",
    body: "Your access to {{organization}} was removed.",
  },
  "suspicious-login": {
    subject: "Suspicious sign-in detected",
    body: "Review this sign-in: {{url}}",
  },
  "session-revoked": {
    subject: "GrowX AI session revoked",
    body: "A session on {{device}} was revoked.",
  },
  "magic-link": {
    subject: "Your GrowX AI sign-in link",
    body: "Sign in: {{url}}",
  },
} as const;
export type EmailTemplate = keyof typeof emailTemplates;
export function renderTemplate(
  template: EmailTemplate,
  variables: Readonly<Record<string, string>>,
): { subject: string; text: string } {
  const source = emailTemplates[template];
  const substitute = (value: string) =>
    value.replace(
      /\{\{([a-zA-Z]+)\}\}/g,
      (_, key: string) => variables[key] ?? "",
    );
  return { subject: source.subject, text: substitute(source.body) };
}
