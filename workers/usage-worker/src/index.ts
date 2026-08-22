export const workerName = "usage-worker";
export async function run(): Promise<void> {
  return Promise.resolve();
}
if (process.env.NODE_ENV !== "test") void run();
