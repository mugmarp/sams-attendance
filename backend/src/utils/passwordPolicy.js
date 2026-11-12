import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8)
  .max(72)
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Use a password of at most 72 UTF-8 bytes",
  );
