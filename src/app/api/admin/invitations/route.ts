import { nanoid } from "nanoid";
import { z } from "zod";
import {
  handleRouteError,
  jsonError,
  jsonOk,
  fixturesEnabled,
} from "@/lib/api/http";
import { assertAdmin } from "@/lib/auth/authorize";
import { fixtureAdmin } from "@/lib/fixtures/admin";

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member"]).default("member"),
});

export async function GET() {
  try {
    await assertAdmin();
    if (fixturesEnabled()) {
      return jsonOk({ invitations: fixtureAdmin.invitations });
    }
    return jsonOk({ invitations: [] });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await assertAdmin();
    if (!fixturesEnabled()) {
      return jsonError(
        "Invitation persistence is not connected in this environment.",
        503,
      );
    }
    const parsed = InviteSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return jsonError("Invalid body", 400);

    return jsonOk({
      id: `inv-${nanoid(10)}`,
      email: parsed.data.email,
      role: parsed.data.role,
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      demo: true,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
