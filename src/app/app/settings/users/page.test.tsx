import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import {
  getUserAdministration,
  userAdminDatabaseConnectionMessage,
} from "@/lib/user-admin";

import UserAdministrationPage from "./page";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/lib/user-admin", () => ({
  getUserAdministration: vi.fn(),
  isPrismaConnectivityError: vi.fn((error) => error?.kind === "connectivity"),
  isUserAdminDatabaseConnectionError: vi.fn((error) => error?.kind === "connectivity"),
  userAdminDatabaseConnectionMessage:
    "No fue posible conectar con la base de datos. Intenta nuevamente.",
}));

vi.mock("./actions", () => ({
  setUserActiveAction: vi.fn(),
}));

describe("/app/settings/users page", () => {
  it("renders a controlled database connection state instead of throwing an overlay", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "admin_1" },
    } as never);
    vi.mocked(getUserAdministration).mockRejectedValueOnce({ kind: "connectivity" });

    const html = renderToStaticMarkup(await UserAdministrationPage({
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain(userAdminDatabaseConnectionMessage);
    expect(html).toContain("Reintentar");
  });
});
