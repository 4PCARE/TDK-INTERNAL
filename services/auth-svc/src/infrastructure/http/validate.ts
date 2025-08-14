/**
 * Validation utilities for auth-svc responses
 * Uses Zod if available, fallback to basic type checking
 */

export function validateUser(data: any): data is { id: string; email: string; roles: string[] } {
  try {
    // Try to use Zod for proper validation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const z: typeof import("zod") = require("zod");
    const UserSchema = z.object({
      id: z.string().uuid(),
      email: z.string().email(),
      roles: z.array(z.string()),
    });
    UserSchema.parse(data);
    return true;
  } catch {
    // Fallback to basic type checking
    return !!(
      data &&
      typeof data.id === "string" &&
      typeof data.email === "string" &&
      Array.isArray(data.roles) &&
      data.roles.every((role: any) => typeof role === "string")
    );
  }
}

export function validateLoginReq(data: any): data is { email: string; password: string } {
  try {
    // Try to use Zod for proper validation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const z: typeof import("zod") = require("zod");
    const LoginReqSchema = z.object({
      email: z.string().email(),
      password: z.string(),
    });
    LoginReqSchema.parse(data);
    return true;
  } catch {
    // Fallback to basic type checking
    return !!(
      data &&
      typeof data.email === "string" &&
      typeof data.password === "string"
    );
  }
}

export function validateLoginRes(data: any): data is { accessToken: string; refreshToken: string } {
  try {
    // Try to use Zod for proper validation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const z: typeof import("zod") = require("zod");
    const LoginResSchema = z.object({
      accessToken: z.string(),
      refreshToken: z.string(),
    });
    LoginResSchema.parse(data);
    return true;
  } catch {
    // Fallback to basic type checking
    return !!(
      data &&
      typeof data.accessToken === "string" &&
      typeof data.refreshToken === "string"
    );
  }
}

export function validateRefreshReq(data: any): data is { refreshToken: string } {
  try {
    // Try to use Zod for proper validation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const z: typeof import("zod") = require("zod");
    const RefreshReqSchema = z.object({
      refreshToken: z.string().min(1),
    });
    RefreshReqSchema.parse(data);
    return true;
  } catch {
    // Fallback to basic type checking
    return !!(
      data &&
      typeof data.refreshToken === "string" &&
      data.refreshToken.length > 0
    );
  }
}

export function validateRefreshRes(data: any): data is { accessToken: string } {
  try {
    // Try to use Zod for proper validation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const z: typeof import("zod") = require("zod");
    const RefreshResSchema = z.object({
      accessToken: z.string().min(1),
    });
    RefreshResSchema.parse(data);
    return true;
  } catch {
    // Fallback to basic type checking
    return !!(
      data &&
      typeof data.accessToken === "string" &&
      data.accessToken.length > 0
    );
  }
}

export function validateRolesRes(data: any): data is string[] {
  try {
    // Try to use Zod for proper validation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const z: typeof import("zod") = require("zod");
    const RolesResSchema = z.array(z.string());
    RolesResSchema.parse(data);
    return true;
  } catch {
    // Fallback to basic type checking
    return !!(
      Array.isArray(data) &&
      data.every((role: any) => typeof role === "string")
    );
  }
}

export function validatePolicyCheckReq(data: any): data is { subject: string; action: string; resource?: string } {
  try {
    // Try to use Zod for proper validation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const z: typeof import("zod") = require("zod");
    const PolicyCheckReqSchema = z.object({
      subject: z.string(),
      action: z.string(),
      resource: z.string().optional(),
    });
    PolicyCheckReqSchema.parse(data);
    return true;
  } catch {
    // Fallback to basic type checking
    return !!(
      data &&
      typeof data.subject === "string" &&
      typeof data.action === "string" &&
      (data.resource === undefined || typeof data.resource === "string")
    );
  }
}

export function validatePolicyCheckRes(data: any): data is { allow: boolean } {
  try {
    // Try to use Zod for proper validation
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const z: typeof import("zod") = require("zod");
    const PolicyCheckResSchema = z.object({
      allow: z.boolean(),
    });
    PolicyCheckResSchema.parse(data);
    return true;
  } catch {
    // Fallback to basic type checking
    return !!(
      data &&
      typeof data.allow === "boolean"
    );
  }
}