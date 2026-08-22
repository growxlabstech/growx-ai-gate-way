export interface HealthAwareConnection {
  healthCheck(): Promise<void>;
  close(): Promise<void>;
}
export interface RedisConnectionFactory {
  connect(url: URL): Promise<HealthAwareConnection>;
}
export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}
export interface EmailProvider {
  send(message: {
    to: string;
    subject: string;
    text: string;
  }): Promise<{ id: string }>;
}
export interface PaymentProvider {
  readonly name: "stripe" | "razorpay";
  healthCheck(): Promise<void>;
}
export interface FeatureFlagProvider {
  enabled(
    key: string,
    context: Readonly<Record<string, string>>,
  ): Promise<boolean>;
}
