export interface RenderedContent {
  subject?: string | undefined;
  text?: string | undefined;
  html?: string | undefined;
  title?: string | undefined; // For in-app
  body?: string | undefined; // For in-app
  actionUrl?: string | undefined;
}

export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return "";
  const s = String(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface TemplateDefinition {
  key: string;
  version: number;
  requiredVariables: readonly string[];
  renderEmail: (data: Record<string, any>) => {
    subject: string;
    text: string;
    html: string;
  };
  renderInApp?: (data: Record<string, any>) => {
    title: string;
    body: string;
    actionUrl?: string;
  };
}

export const TEMPLATE_REGISTRY: Record<string, TemplateDefinition> = {
  "auth.otp": {
    key: "auth.otp",
    version: 1,
    requiredVariables: ["otp", "expiresInMinutes"],
    renderEmail: (d) => {
      const otp = escapeHtml(d.otp);
      const minutes = escapeHtml(d.expiresInMinutes);
      return {
        subject: "Your GrowX AI verification code",
        text: `Your verification code is: ${otp}\n\nThis code expires in ${minutes} minutes.\nIf you did not request this, please ignore this email.`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>GrowX AI Verification</h2>
          <p>Use the verification code below to sign in:</p>
          <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px; padding: 12px; background: #f4f4f5; display: inline-block; border-radius: 6px;">${otp}</div>
          <p style="color: #71717a; font-size: 14px; margin-top: 20px;">This code expires in ${minutes} minutes. If you did not request this code, you can safely ignore this email.</p>
        </div>`,
      };
    },
  },

  "security.alert": {
    key: "security.alert",
    version: 1,
    requiredVariables: ["title", "description"],
    renderEmail: (d) => {
      const title = escapeHtml(d.title);
      const desc = escapeHtml(d.description);
      const url = escapeHtml(
        d.consoleUrl ?? "https://console.growx.ai/security",
      );
      return {
        subject: `[Security Alert] ${title}`,
        text: `Security Alert: ${title}\n\n${desc}\n\nReview in console: ${url}`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #ef4444;">Security Alert: ${title}</h2>
          <p>${desc}</p>
          <p><a href="${url}" style="display: inline-block; padding: 10px 16px; background: #ef4444; color: white; text-decoration: none; border-radius: 4px;">Review in Security Console</a></p>
        </div>`,
      };
    },
    renderInApp: (d) => ({
      title: `Security Alert: ${d.title}`,
      body: String(d.description),
      actionUrl: d.consoleUrl ?? "/security",
    }),
  },

  "api_key.revoked": {
    key: "api_key.revoked",
    version: 1,
    requiredVariables: ["keyName"],
    renderEmail: (d) => {
      const keyName = escapeHtml(d.keyName);
      return {
        subject: `API Key '${keyName}' was revoked`,
        text: `Your GrowX API key '${keyName}' was revoked and can no longer make inference requests.`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>API Key Revoked</h2>
          <p>Your API key <strong>${keyName}</strong> was revoked and is now disabled.</p>
        </div>`,
      };
    },
    renderInApp: (d) => ({
      title: `API Key '${d.keyName}' revoked`,
      body: `API key '${d.keyName}' was revoked.`,
      actionUrl: "/api-keys",
    }),
  },

  "api_key.expiring": {
    key: "api_key.expiring",
    version: 1,
    requiredVariables: ["keyName", "expiresInDays"],
    renderEmail: (d) => {
      const keyName = escapeHtml(d.keyName);
      const days = escapeHtml(d.expiresInDays);
      return {
        subject: `API Key '${keyName}' is expiring in ${days} days`,
        text: `Your API key '${keyName}' will expire in ${days} days. Please rotate it.`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>API Key Expiring Soon</h2>
          <p>Your API key <strong>${keyName}</strong> will expire in <strong>${days} days</strong>.</p>
        </div>`,
      };
    },
    renderInApp: (d) => ({
      title: `API Key '${d.keyName}' expiring`,
      body: `API key will expire in ${d.expiresInDays} days.`,
      actionUrl: "/api-keys",
    }),
  },

  "credit.low": {
    key: "credit.low",
    version: 1,
    requiredVariables: ["remainingCredits"],
    renderEmail: (d) => {
      const credits = escapeHtml(d.remainingCredits);
      return {
        subject: "Your GrowX AI credit balance is running low",
        text: `Your credit balance has dropped to ${credits}. Top up to avoid request interruption.`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Low Credit Balance</h2>
          <p>Your remaining balance is <strong>${credits} credits</strong>. Please top up your wallet to ensure uninterrupted AI gateway service.</p>
        </div>`,
      };
    },
    renderInApp: (d) => ({
      title: "Credit balance running low",
      body: `Remaining balance: ${d.remainingCredits} credits.`,
      actionUrl: "/billing",
    }),
  },

  "credit.exhausted": {
    key: "credit.exhausted",
    version: 1,
    requiredVariables: [],
    renderEmail: () => ({
      subject: "Action Required: GrowX AI credits exhausted",
      text: "Your credit balance is depleted. Inference requests will be paused until you top up.",
      html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #ef4444;">Credits Exhausted</h2>
        <p>Your credit balance has reached 0. Please top up immediately to resume inference requests.</p>
      </div>`,
    }),
    renderInApp: () => ({
      title: "Credits Exhausted",
      body: "Your balance is 0. Top up to resume gateway execution.",
      actionUrl: "/billing",
    }),
  },

  "payment.failed": {
    key: "payment.failed",
    version: 1,
    requiredVariables: ["amount", "currency"],
    renderEmail: (d) => {
      const amount = escapeHtml(d.amount);
      const currency = escapeHtml(d.currency);
      return {
        subject: `Payment failed for ${currency} ${amount}`,
        text: `We were unable to process your payment of ${currency} ${amount}. Please update your payment method.`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #ef4444;">Payment Failed</h2>
          <p>We could not charge your payment method for <strong>${currency} ${amount}</strong>.</p>
        </div>`,
      };
    },
    renderInApp: (d) => ({
      title: "Payment Failed",
      body: `Payment of ${d.currency} ${d.amount} could not be processed.`,
      actionUrl: "/billing",
    }),
  },

  "payment.succeeded": {
    key: "payment.succeeded",
    version: 1,
    requiredVariables: ["amount", "currency"],
    renderEmail: (d) => {
      const amount = escapeHtml(d.amount);
      const currency = escapeHtml(d.currency);
      return {
        subject: `Payment receipt for ${currency} ${amount}`,
        text: `Thank you. Your payment of ${currency} ${amount} was successfully processed.`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Payment Succeeded</h2>
          <p>We received your payment of <strong>${currency} ${amount}</strong>.</p>
        </div>`,
      };
    },
  },

  "invoice.issued": {
    key: "invoice.issued",
    version: 1,
    requiredVariables: ["invoiceNumber", "amount", "currency"],
    renderEmail: (d) => {
      const inv = escapeHtml(d.invoiceNumber);
      const amount = escapeHtml(d.amount);
      const currency = escapeHtml(d.currency);
      return {
        subject: `Invoice ${inv} from GrowX AI (${currency} ${amount})`,
        text: `Invoice ${inv} for ${currency} ${amount} has been issued.`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Invoice ${inv}</h2>
          <p>Your invoice for <strong>${currency} ${amount}</strong> is ready.</p>
        </div>`,
      };
    },
  },

  "webhook.endpoint_failing": {
    key: "webhook.endpoint_failing",
    version: 1,
    requiredVariables: ["endpointUrl", "consecutiveFailures"],
    renderEmail: (d) => {
      const url = escapeHtml(d.endpointUrl);
      const failures = escapeHtml(d.consecutiveFailures);
      return {
        subject: `Webhook endpoint failing: ${url}`,
        text: `Your webhook endpoint ${url} has failed ${failures} consecutive delivery attempts.`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Webhook Endpoint Degraded</h2>
          <p>Endpoint <code>${url}</code> has failed <strong>${failures} consecutive times</strong>.</p>
        </div>`,
      };
    },
    renderInApp: (d) => ({
      title: "Webhook Endpoint Failing",
      body: `Endpoint ${d.endpointUrl} has failed ${d.consecutiveFailures} consecutive deliveries.`,
      actionUrl: "/webhooks",
    }),
  },

  "subscription.updated": {
    key: "subscription.updated",
    version: 1,
    requiredVariables: ["planName"],
    renderEmail: (d) => {
      const plan = escapeHtml(d.planName);
      return {
        subject: `Subscription updated to ${plan}`,
        text: `Your organization's subscription has been updated to ${plan}.`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Subscription Updated</h2>
          <p>Your subscription is now on the <strong>${plan}</strong> plan.</p>
        </div>`,
      };
    },
    renderInApp: (d) => ({
      title: "Subscription Updated",
      body: `Plan changed to ${d.planName}.`,
      actionUrl: "/billing",
    }),
  },

  "subscription.renewal_upcoming": {
    key: "subscription.renewal_upcoming",
    version: 1,
    requiredVariables: ["planName", "renewalDate", "amount", "currency"],
    renderEmail: (d) => {
      const plan = escapeHtml(d.planName);
      const date = escapeHtml(d.renewalDate);
      const amount = escapeHtml(d.amount);
      const currency = escapeHtml(d.currency);
      return {
        subject: `Upcoming subscription renewal for ${plan}`,
        text: `Your subscription to ${plan} will renew on ${date} for ${currency} ${amount}.`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Upcoming Subscription Renewal</h2>
          <p>Your <strong>${plan}</strong> subscription renews on <strong>${date}</strong> for <strong>${currency} ${amount}</strong>.</p>
        </div>`,
      };
    },
  },
};

export function renderNotificationContent(
  templateKey: string,
  channel: "email" | "in_app",
  data: Record<string, any>,
): RenderedContent {
  const tpl = TEMPLATE_REGISTRY[templateKey];
  if (!tpl) {
    throw new Error(`Notification template not found: ${templateKey}`);
  }

  // Validate required variables
  for (const v of tpl.requiredVariables) {
    if (data[v] === undefined || data[v] === null) {
      throw new Error(
        `Missing required variable '${v}' for template '${templateKey}'`,
      );
    }
  }

  if (channel === "email") {
    const rendered = tpl.renderEmail(data);
    return {
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    };
  }

  if (channel === "in_app") {
    if (!tpl.renderInApp) {
      // Fallback in-app rendering from email subject
      const email = tpl.renderEmail(data);
      return {
        title: email.subject,
        body: email.text.slice(0, 300),
      };
    }
    const inApp = tpl.renderInApp(data);
    return {
      title: inApp.title,
      body: inApp.body,
      actionUrl: inApp.actionUrl,
    };
  }

  throw new Error(`Unsupported notification channel: ${channel}`);
}
