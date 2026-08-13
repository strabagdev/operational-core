import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /api/v1/health", () => {
  it("returns the versioned API health payload", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        service: "opco-api",
        version: "v1",
      },
    });
  });
});
