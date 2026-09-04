import "server-only";

import { z } from "zod";

import { ForgePartnerError } from "@/lib/forge/forge-handoff-errors";

const partnerAcceptedSchema = z.object({
  jobId: z.string().uuid(),
  trackerUrl: z.string().url(),
});

export type SubmitPartnerIngestInput = {
  readonly markdown: string;
  readonly sourceFilename: string;
  readonly baseUrl: string;
  readonly partnerSecret: string;
  readonly fetchImpl?: typeof fetch;
};

export type SubmitPartnerIngestResult = {
  readonly jobId: string;
  readonly trackerUrl: string;
};

export async function submitPartnerIngest(
  input: SubmitPartnerIngestInput,
): Promise<SubmitPartnerIngestResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${input.baseUrl.replace(/\/$/, "")}/api/partner/ingest`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.partnerSecret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        markdown: input.markdown,
        sourceFilename: input.sourceFilename,
      }),
    },
  );

  const rawText = await response.text();
  let payload: unknown = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  if (response.status !== 202) {
    const code =
      payload &&
      typeof payload === "object" &&
      "code" in payload &&
      typeof (payload as { code: unknown }).code === "string"
        ? (payload as { code: string }).code
        : "FORGE_REQUEST_FAILED";
    throw new ForgePartnerError(
      response.status,
      code,
      "Could not start Forge pipeline",
    );
  }

  const parsed = partnerAcceptedSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ForgePartnerError(
      502,
      "INVALID_FORGE_RESPONSE",
      "Could not start Forge pipeline",
    );
  }

  return {
    jobId: parsed.data.jobId,
    trackerUrl: parsed.data.trackerUrl,
  };
}
