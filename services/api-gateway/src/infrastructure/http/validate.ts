export type Health = { ok: true };
export type Ready = { ready: true };

export function validateHealth(data: any): data is Health {
  try {
    // Optional zod: import within try to avoid bundler resolution if not installed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const z: typeof import("zod") = require("zod");
    const HealthSchema = z.object({ ok: z.literal(true) });
    HealthSchema.parse(data);
    return true;
  } catch {
    return !!(data && data.ok === true);
  }
}

export function validateReady(data: any): data is Ready {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const z: typeof import("zod") = require("zod");
    const ReadySchema = z.object({ ready: z.literal(true) });
    ReadySchema.parse(data);
    return true;
  } catch {
    return !!(data && data.ready === true);
  }
}