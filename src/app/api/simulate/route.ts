import { streamText } from "ai";
import { z } from "zod";

import { getAgentConfig } from "@/ai/agents/config";
import { buildPmUserPrompt, PM_SYSTEM_PROMPT } from "@/ai/prompts/pm";
import { getDeepSeekModel } from "@/ai/providers";
import { getPersona } from "@/features/agents/personas";
import type { AgentRole } from "@/features/agents/types";
import {
  encodeSimulationEvent,
  type SimulationStreamEvent,
} from "@/lib/simulation-stream";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Prompt is required (1–4000 characters)" },
      { status: 400 },
    );
  }

  const { prompt } = parsed.data;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SimulationStreamEvent) => {
        controller.enqueue(
          new TextEncoder().encode(encodeSimulationEvent(event)),
        );
      };

      try {
        await runPmAgent(prompt, send);
        send({ type: "done" });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Simulation failed";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function runPmAgent(
  productIdea: string,
  send: (event: SimulationStreamEvent) => void,
) {
  const role: AgentRole = "pm";
  const config = getAgentConfig(role);
  const persona = getPersona(role);

  send({
    type: "agent_start",
    role,
    name: persona.name,
    title: persona.title,
  });

  const result = streamText({
    model: getDeepSeekModel(config.model),
    system: PM_SYSTEM_PROMPT,
    prompt: buildPmUserPrompt(productIdea),
    maxOutputTokens: config.maxOutputTokens,
    temperature: config.temperature,
  });

  for await (const delta of result.textStream) {
    send({ type: "text-delta", role, delta });
  }

  send({ type: "agent_end", role });
}
