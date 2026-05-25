import { z } from "zod";

export const authCredentialsSchema = z.object({
  email: z.pipe(z.string().trim().max(320), z.email()),
  password: z.string().min(8).max(128),
});

export type AuthCredentials = z.infer<typeof authCredentialsSchema>;
