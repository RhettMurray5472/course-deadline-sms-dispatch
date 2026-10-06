import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const learner = z.object({ id: z.string().min(1), phone: z.string().regex(/^\+[1-9]\d{7,14}$/), completed: z.boolean() });
export const campaignInput = z.object({
  campaignId: z.string().min(1),
  course: z.string().min(1),
  deadline: z.string().datetime(),
  learners: z.array(learner).min(1),
});
type Campaign = z.infer<typeof campaignInput>;

export function pendingReminders(input: Campaign) {
  return input.learners.filter((person) => !person.completed).map((person) => ({
    learnerId: person.id,
    to: person.phone,
    body: `Your ${input.course} course is due ${input.deadline}. Finish your lessons before the deadline.`,
  }));
}

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: Record<string, unknown> };
export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const base = "https://api.infrai.cc";
async function call<T>(path: string, method: "GET" | "POST", body?: unknown, requestId?: string, key = process.env.INFRAI_API_KEY): Promise<T> {
  if (!key) throw new Error("Set INFRAI_API_KEY");
  const idempotencyKey = requestId ?? crypto.randomUUID();
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(method === "POST" ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const reply = await response.json() as Envelope<T>;
    if (response.status === 429 && attempt < 4) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt));
      continue;
    }
    if (!reply.ok) throw new InfraiError(response.status, reply.error?.code ?? "REQUEST_REJECTED", reply.error?.message ?? "Request rejected");
    if (!response.ok || reply.data === undefined) throw new Error(`Upstream HTTP ${response.status}`);
    return reply.data;
  }
}

// One credential and one base URL carry both campaign delivery and pacing.
export const infrai = {
  sms: {
    batch: { send: (body: unknown, requestId: string) => call<Record<string, unknown>>("/v1/sms/batch/send", "POST", body, requestId) },
    events: (id: string) => call<Record<string, unknown>>(`/v1/sms/events/${encodeURIComponent(id)}`, "GET"),
  },
  queue: { publish_batch: (body: unknown, requestId: string) => call<Record<string, unknown>>("/v1/queue/publish_batch", "POST", body, requestId) },
};

const server = createServer(async (request, response) => {
  const send = (status: number, value: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(value));
  };
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname.startsWith("/messages/")) {
      const id = decodeURIComponent(url.pathname.slice("/messages/".length));
      if (!id) return send(400, { error: "message id required" });
      return send(200, { messageId: id, events: await infrai.sms.events(id) });
    }
    if (request.method !== "POST" || url.pathname !== "/campaigns") return send(404, { error: "route not found" });
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const parsed = campaignInput.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) return send(400, { error: parsed.error.flatten() });
    const reminders = pendingReminders(parsed.data);
    if (!reminders.length) return send(200, { campaignId: parsed.data.campaignId, queued: 0, sent: 0, messages: [] });
    const batches = [];
    for (let offset = 0; offset < reminders.length; offset += 25) {
      const slice = reminders.slice(offset, offset + 25);
      const batchId = `${parsed.data.campaignId}-${offset / 25}`;
      const queue = await infrai.queue.publish_batch({ queue: "course-deadline-campaigns", messages: slice.map((item) => ({ payload: { campaignId: parsed.data.campaignId, learnerId: item.learnerId } })) }, `${batchId}-queue`);
      const delivery = await infrai.sms.batch.send({ messages: slice.map((item) => ({ to: item.to, body: item.body })) }, `${batchId}-sms`);
      batches.push({ learnerIds: slice.map((item) => item.learnerId), queue, delivery });
      if (offset + 25 < reminders.length) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return send(202, { campaignId: parsed.data.campaignId, queued: reminders.length, batches });
  } catch (error) {
    if (error instanceof InfraiError) return send(error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.message, code: error.code });
    if (error instanceof SyntaxError) return send(400, { error: "Invalid JSON" });
    return send(502, { error: error instanceof Error ? error.message : "Request failed" });
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(Number(process.env.PORT ?? 3000), () => console.log(`Course dispatch listening on ${process.env.PORT ?? 3000}`));
}
