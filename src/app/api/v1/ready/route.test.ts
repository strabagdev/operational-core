import { beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { GET } from "./route";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $disconnect: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

const queryRaw = vi.mocked(prisma.$queryRaw);

describe("GET /api/v1/ready", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns ready when the database responds", async () => {
    queryRaw.mockResolvedValueOnce([{ "?column?": 1 }] as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
  });

  it("returns not_ready without leaking internals when the database stays down", async () => {
    const connectionError = Object.assign(
      new Error("Can't reach database server at `db.internal:5432`"),
      { name: "PrismaClientInitializationError" },
    );
    queryRaw.mockRejectedValue(connectionError);

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      reason: "database",
      status: "not_ready",
    });
  });
});
