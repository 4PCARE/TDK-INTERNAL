
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
