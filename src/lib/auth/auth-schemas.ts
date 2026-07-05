import { z } from "zod";

export const authCredentialsSchema = z.object({
  email: z.pipe(z.string().trim().max(320), z.email()).transform((val) => val.toLowerCase()),
  password: z.string().min(8).max(128),
});

export type AuthCredentials = z.infer<typeof authCredentialsSchema>;

export const logoutBodySchema = z.object({
  runId: z.string().trim().min(1).optional(),
});

export type LogoutBody = z.infer<typeof logoutBodySchema>;
