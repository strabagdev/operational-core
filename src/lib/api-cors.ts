const apiCorsAllowedMethods = "GET,POST,PATCH,OPTIONS";
const apiCorsAllowedHeaders = "Authorization,Content-Type";
const apiCorsMaxAge = "600";

type ApiCorsEnv = {
  API_ALLOWED_ORIGINS?: string;
};

function defaultApiCorsEnv(): ApiCorsEnv {
  return {
    API_ALLOWED_ORIGINS: process.env.API_ALLOWED_ORIGINS,
  };
}

export function parseApiAllowedOrigins(env: ApiCorsEnv = defaultApiCorsEnv()) {
  return Array.from(
    new Set(
      (env.API_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  );
}

export function getAuthorizedApiCorsOrigin(
  request: Request,
  env?: ApiCorsEnv,
) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return null;
  }

  return parseApiAllowedOrigins(env).includes(origin) ? origin : null;
}

export function getApiCorsHeaders(request: Request, env?: ApiCorsEnv) {
  const headers = new Headers();
  const origin = getAuthorizedApiCorsOrigin(request, env);

  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", apiCorsAllowedMethods);
  headers.set("Access-Control-Allow-Headers", apiCorsAllowedHeaders);
  headers.set("Access-Control-Max-Age", apiCorsMaxAge);

  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

export function applyApiCorsHeaders(
  targetHeaders: Headers,
  request: Request,
  env?: ApiCorsEnv,
) {
  for (const [key, value] of getApiCorsHeaders(request, env)) {
    targetHeaders.set(key, value);
  }
}

export function apiCorsPreflightResponse(request: Request, env?: ApiCorsEnv) {
  return new Response(null, {
    headers: getApiCorsHeaders(request, env),
    status: 204,
  });
}
