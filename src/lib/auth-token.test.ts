import { describe, expect, it } from "vitest";

import { applyAuthenticatedUserToToken } from "./auth-token";

describe("auth JWT token callback helper", () => {
  it("stores the authenticated user in the token at login", () => {
    const token = applyAuthenticatedUserToToken({}, {
      email: "admin@operational-core.local",
      id: "user_1",
      image: null,
      name: "Administrator",
    });

    expect(token).toEqual({
      email: "admin@operational-core.local",
      id: "user_1",
      name: "Administrator",
      picture: null,
    });
  });

  it("keeps an existing token valid across later session reads without a database refresh", () => {
    const token = applyAuthenticatedUserToToken({
      email: "admin@operational-core.local",
      id: "user_1",
      name: "Administrator",
      picture: null,
    });

    expect(token).toMatchObject({
      email: "admin@operational-core.local",
      id: "user_1",
    });
  });

  it("uses Auth.js subject as the stable id after restart when token.id is absent", () => {
    expect(applyAuthenticatedUserToToken({ sub: "user_1" })).toMatchObject({
      id: "user_1",
      sub: "user_1",
    });
  });

  it("rejects tokens without a stable user id", () => {
    expect(applyAuthenticatedUserToToken({})).toBeNull();
  });
});
