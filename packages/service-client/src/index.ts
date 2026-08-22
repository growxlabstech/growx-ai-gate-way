export interface ServiceClientOptions {
  baseUrl: URL;
  serviceToken: () => Promise<string>;
  timeoutMs?: number;
}
export function createServiceClient(options: ServiceClientOptions) {
  return async (path: string, init: RequestInit = {}) => {
    const token = await options.serviceToken();
    return fetch(new URL(path, options.baseUrl), {
      ...init,
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
      headers: { ...init.headers, authorization: `Bearer ${token}` },
    });
  };
}
