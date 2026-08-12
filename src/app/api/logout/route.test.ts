import { describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("next/server", () => ({
  NextResponse: {
    redirect(url: URL, init?: { status?: number }) {
      const response = new Response(null, {
        headers: { location: url.toString() },
        status: init?.status ?? 307,
      }) as Response & {
        cookies: { set: ReturnType<typeof vi.fn> };
      };

      response.cookies = { set: vi.fn() };

      return response;
    },
  },
}));

describe("POST /api/logout", () => {
  it("redirects to login and expires Operational Core and legacy Auth.js auth cookies", async () => {
    const response = await POST(new Request("http://localhost:3000/api/logout", {
      method: "POST",
    })) as unknown as Response & {
      cookies: { set: ReturnType<typeof vi.fn> };
    };

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(response.cookies.set).toHaveBeenCalledWith(
      "operational-core.session-token",
      "",
      expect.objectContaining({ maxAge: 0, path: "/", secure: false }),
    );
    expect(response.cookies.set).toHaveBeenCalledWith(
      "__Secure-operational-core.session-token",
      "",
      expect.objectContaining({ maxAge: 0, path: "/", secure: true }),
    );
    expect(response.cookies.set).toHaveBeenCalledWith(
      "authjs.session-token",
      "",
      expect.objectContaining({ maxAge: 0, path: "/", secure: false }),
    );
    expect(response.cookies.set).toHaveBeenCalledWith(
      "__Secure-authjs.session-token",
      "",
      expect.objectContaining({ maxAge: 0, path: "/", secure: true }),
    );
  });
});
