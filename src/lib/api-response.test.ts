import { describe, expect, it } from "vitest";

import {
  badRequest,
  conflict,
  forbidden,
  internalError,
  notFound,
  success,
  unauthorized,
} from "./api-response";

async function responseBody(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("API JSON responses", () => {
  it("wraps successful data in the versioned API envelope", async () => {
    const response = success({ service: "opco-api", version: "v1" });

    expect(response.status).toBe(200);
    expect(await responseBody(response)).toEqual({
      ok: true,
      data: {
        service: "opco-api",
        version: "v1",
      },
    });
  });

  it("allows success responses to set an explicit status", async () => {
    const response = success({ id: "record-1" }, { status: 201 });

    expect(response.status).toBe(201);
    expect(await responseBody(response)).toEqual({
      ok: true,
      data: { id: "record-1" },
    });
  });

  it("builds consistent client and authorization errors", async () => {
    const responses = [
      {
        response: badRequest("Campo requerido", "VALIDATION_ERROR"),
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Campo requerido",
      },
      {
        response: unauthorized(),
        status: 401,
        code: "UNAUTHORIZED",
        message: "No autenticado",
      },
      {
        response: forbidden(),
        status: 403,
        code: "FORBIDDEN",
        message: "No autorizado",
      },
      {
        response: notFound(),
        status: 404,
        code: "NOT_FOUND",
        message: "Recurso no encontrado",
      },
      {
        response: conflict("Estado no soportado", "UNSUPPORTED_STATE"),
        status: 409,
        code: "UNSUPPORTED_STATE",
        message: "Estado no soportado",
      },
    ];

    for (const { code, message, response, status } of responses) {
      expect(response.status).toBe(status);
      expect(await responseBody(response)).toEqual({
        ok: false,
        error: { code, message },
      });
    }
  });

  it("builds a generic internal error response", async () => {
    const response = internalError();

    expect(response.status).toBe(500);
    expect(await responseBody(response)).toEqual({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Error interno",
      },
    });
  });
});
