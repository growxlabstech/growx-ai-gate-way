export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string | undefined;
  replyTo?: string | undefined;
}

export interface EmailDeliveryResult {
  providerStatus: number;
  providerMessageId?: string | undefined;
  isDev?: boolean | undefined;
}

export interface EmailProviderAdapter {
  sendEmail(params: SendEmailParams): Promise<EmailDeliveryResult>;
}

export class ResendEmailAdapter implements EmailProviderAdapter {
  private readonly apiKey?: string | undefined;
  private readonly fromEmail?: string | undefined;
  private readonly replyTo?: string | undefined;
  private readonly fetcher: typeof fetch;

  constructor(options?: {
    apiKey?: string | undefined;
    fromEmail?: string | undefined;
    replyTo?: string | undefined;
    fetcher?: typeof fetch | undefined;
  }) {
    this.apiKey = options?.apiKey ?? process.env.RESEND_API_KEY;
    this.fromEmail = options?.fromEmail ?? process.env.RESEND_FROM_EMAIL;
    this.replyTo = options?.replyTo ?? process.env.RESEND_REPLY_TO;
    this.fetcher = options?.fetcher ?? fetch;
  }

  async sendEmail(params: SendEmailParams): Promise<EmailDeliveryResult> {
    // 1. Development / Testing simulated delivery mode
    if (!this.apiKey || !this.fromEmail) {
      return {
        providerStatus: 200,
        providerMessageId: `dev_resend_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        isDev: true,
      };
    }

    // 2. Production Resend API dispatch
    const response = await this.fetcher("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10_000), // 10s strict timeout
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromEmail,
        to: [params.to],
        subject: params.subject,
        text: params.text,
        html: params.html,
        reply_to: params.replyTo ?? this.replyTo,
      }),
    });

    let messageId: string | undefined;
    try {
      const data: any = await response.json();
      messageId = data.id;
    } catch {
      messageId = undefined;
    }

    if (!response.ok) {
      const err = new Error(`Resend rejected delivery with status ${response.status}`);
      (err as any).status = response.status;
      throw err;
    }

    return {
      providerStatus: response.status,
      providerMessageId: messageId,
      isDev: false,
    };
  }
}
