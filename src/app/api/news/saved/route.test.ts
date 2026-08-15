import { beforeEach, describe, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/lib/auth/authorize", () => ({
  requirePermission: vi.fn(async () => ({
    id: "user-1",
    email: "member@example.com",
    role: "member",
    firmId: "firm-1",
  })),
}));

vi.mock("@/lib/intelligence/saved-searches", () => ({
  listSavedNewsSearches: saved.list,
  saveNewsSearch: saved.save,
  deleteSavedNewsSearch: saved.remove,
}));

import { GET, POST } from "@/app/api/news/saved/route";

describe("/api/news/saved", () => {
  beforeEach(() => {
    saved.list.mockReset();
    saved.save.mockReset();
    saved.remove.mockReset();
  });

  it("lists saved searches for the authenticated user", async () => {
    saved.list.mockResolvedValue([
      {
        id: "s1",
        name: "IREN",
        query: "why is IREN down today",
        filters: {},
        createdAt: "2026-08-15T18:00:00.000Z",
        updatedAt: "2026-08-15T18:00:00.000Z",
      },
    ]);
    const response = await GET();
    const body = (await response.json()) as { persistence: string; searches: unknown[] };
    expect(response.status).toBe(200);
    expect(body.persistence).toBe("supabase");
    expect(body.searches).toHaveLength(1);
    expect(saved.list).toHaveBeenCalledWith("user-1", "firm-1");
  });

  it("requires name and query on write", async () => {
    const response = await POST(
      new Request("http://localhost/api/news/saved", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(saved.save).not.toHaveBeenCalled();
  });
});
