import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { proxy } from "../proxy";
import {
  apiCorsPreflightResponse,
  applyApiCorsHeaders,
  getApiCorsHeaders,
  getAuthorizedApiCorsOrigin,
  parseApiAllowedOrigins,
} from "./api-cors";

const allowedOrigin = "http://localhost:8081";
const secondAllowedOrigin = "http://localhost:19006";
const deniedOrigin = "http://localhost:3001";

function request({
  method = "GET",
  origin = allowedOrigin,
  url = "http://localhost/api/v1/health",
}: {
  method?: string;
  origin?: string;
  url?: string;
} = {}) {
  return new Request(url, {
    headers: origin ? { Origin: origin } : undefined,
    method,
  });
}

function nextRequest({
  method = "GET",
  origin = allowedOrigin,
  url = "http://localhost/api/v1/health",
}: {
  method?: string;
  origin?: string;
  url?: string;
} = {}) {
  return new NextRequest(url, {
    headers: origin ? { Origin: origin } : undefined,
    method,
  });
}

afterEach(() => {
  delete process.env.API_ALLOWED_ORIGINS;
});

describe("API CORS helpers", () => {
  it("parses multiple configured origins exactly", () => {
    expect(parseApiAllowedOrigins({
      API_ALLOWED_ORIGINS: ` ${allowedOrigin},${secondAllowedOrigin},${allowedOrigin}, `,
    })).toEqual([allowedOrigin, secondAllowedOrigin]);
  });

  it("allows only exact configured origins", () => {
    const env = { API_ALLOWED_ORIGINS: `${allowedOrigin},${secondAllowedOrigin}` };

    expect(getAuthorizedApiCorsOrigin(request({ origin: allowedOrigin }), env)).toBe(allowedOrigin);
    expect(getAuthorizedApiCorsOrigin(request({ origin: secondAllowedOrigin }), env)).toBe(secondAllowedOrigin);
    expect(getAuthorizedApiCorsOrigin(request({ origin: `${allowedOrigin}.evil.test` }), env)).toBeNull();
    expect(getAuthorizedApiCorsOrigin(request({ origin: deniedOrigin }), env)).toBeNull();
  });

  it("adds CORS headers only with ACAO for authorized origins", () => {
    const headers = getApiCorsHeaders(request({ origin: allowedOrigin }), {
      API_ALLOWED_ORIGINS: allowedOrigin,
    });

    expect(headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
    expect(headers.get("Vary")).toBe("Origin");
    expect(headers.get("Access-Control-Allow-Methods")).toBe("GET,POST,PATCH,OPTIONS");
    expect(headers.get("Access-Control-Allow-Headers")).toBe("Authorization,Content-Type");
    expect(headers.get("Access-Control-Max-Age")).toBe("600");

    const deniedHeaders = getApiCorsHeaders(request({ origin: deniedOrigin }), {
      API_ALLOWED_ORIGINS: allowedOrigin,
    });

    expect(deniedHeaders.get("Access-Control-Allow-Origin")).toBeNull();
    expect(deniedHeaders.get("Vary")).toBe("Origin");
  });

  it("builds an authorized 204 preflight response", () => {
    const response = apiCorsPreflightResponse(request({
      method: "OPTIONS",
      origin: allowedOrigin,
    }), {
      API_ALLOWED_ORIGINS: allowedOrigin,
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("applies CORS headers to normal API responses", () => {
    const headers = new Headers({ "Content-Type": "application/json" });

    applyApiCorsHeaders(headers, request({ origin: allowedOrigin }), {
      API_ALLOWED_ORIGINS: allowedOrigin,
    });

    expect(headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
    expect(headers.get("Vary")).toBe("Origin");
    expect(headers.get("Content-Type")).toBe("application/json");
  });
});

describe("API CORS proxy integration", () => {
  it("returns 204 for authorized /api/v1 OPTIONS preflight", () => {
    process.env.API_ALLOWED_ORIGINS = `${allowedOrigin},${secondAllowedOrigin}`;

    const response = proxy(nextRequest({
      method: "OPTIONS",
      origin: secondAllowedOrigin,
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(secondAllowedOrigin);
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Authorization,Content-Type");
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("does not return ACAO for unauthorized preflight origins", () => {
    process.env.API_ALLOWED_ORIGINS = allowedOrigin;

    const response = proxy(nextRequest({
      method: "OPTIONS",
      origin: deniedOrigin,
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("adds CORS headers to normal GET and POST API requests", () => {
    process.env.API_ALLOWED_ORIGINS = allowedOrigin;

    const getResponse = proxy(nextRequest({ method: "GET" }));
    const postResponse = proxy(nextRequest({
      method: "POST",
      url: "http://localhost/api/v1/auth/login",
    }));

    expect(getResponse.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
    expect(getResponse.headers.get("Vary")).toBe("Origin");
    expect(postResponse.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
    expect(postResponse.headers.get("Vary")).toBe("Origin");
  });

  it("does not add ACAO to normal API requests from unauthorized origins", () => {
    process.env.API_ALLOWED_ORIGINS = allowedOrigin;

    const response = proxy(nextRequest({ origin: deniedOrigin }));

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Vary")).toBe("Origin");
  });
});
