export const workerName = "provider-sync-worker";
export async function run(): Promise<void> {
  return Promise.resolve();
}
if (process.env.NODE_ENV !== "test") void run();
