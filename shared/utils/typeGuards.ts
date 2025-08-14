
/**
 * Reusable type guards for safer type checking
 */

export const isRecord = (v: unknown): v is Record<string, unknown> => 
  !!v && typeof v === "object";

export const hasProp = <K extends string>(o: unknown, k: K): o is Record<K, unknown> => 
  isRecord(o) && k in o;

export const isBotMessage = (m: unknown): m is { type?: string; content?: string } => 
  isRecord(m) && typeof m.type === "string";

export const hasStringProp = <K extends string>(o: unknown, k: K): o is Record<K, string> =>
  isRecord(o) && k in o && typeof o[k] === "string";

export const hasNumberProp = <K extends string>(o: unknown, k: K): o is Record<K, number> =>
  isRecord(o) && k in o && typeof o[k] === "number";

export const hasBooleanProp = <K extends string>(o: unknown, k: K): o is Record<K, boolean> =>
  isRecord(o) && k in o && typeof o[k] === "boolean";
