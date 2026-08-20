import type { z } from "zod";
import { ValidationError } from "@growx/shared";
export function validate<T>(schema: z.ZodType<T>, input: unknown): T { const result = schema.safeParse(input); if (!result.success) throw new ValidationError(undefined, result.error.flatten()); return result.data; }
