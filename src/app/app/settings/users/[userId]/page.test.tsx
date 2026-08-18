import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import {
  getEditableUserForAdmin,
  userAdminDatabaseConnectionMessage,
} from "@/lib/user-admin";

import EditUserPage from "./page";
import { notFound } from "next/navigation";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/lib/user-admin", () => ({
  getEditableUserForAdmin: vi.fn(),
  isPrismaConnectivityError: vi.fn((error) => error?.kind === "connectivity"),
  isUserAdminDatabaseConnectionError: vi.fn((error) => error?.kind === "connectivity"),
  userAdminDatabaseConnectionMessage:
    "No fue posible conectar con la base de datos. Intenta nuevamente.",
}));

vi.mock("../actions", () => ({
  deleteUserAction: vi.fn(),
  setUserActiveAction: vi.fn(),
  updateUserAction: vi.fn(),
  updateUserExperiencesAction: vi.fn(),
}));

describe("/app/settings/users/[userId] page", () => {
  it("does not treat database connectivity failure as a missing user", async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: { id: "admin_1" },
    } as never);
    vi.mocked(getEditableUserForAdmin).mockRejectedValueOnce({ kind: "connectivity" });

    const html = renderToStaticMarkup(await EditUserPage({
      params: Promise.resolve({ userId: "user_1" }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain(userAdminDatabaseConnectionMessage);
    expect(html).toContain("Reintentar");
    expect(notFound).not.toHaveBeenCalled();
  });
});
