export type ApiSuccessResponse<TData> = {
  ok: true;
  data: TData;
};

export type ApiErrorResponse = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

export type ApiResponse<TData> = ApiSuccessResponse<TData> | ApiErrorResponse;

type ApiResponseInit = {
  status?: number;
  headers?: HeadersInit;
};

type ApiErrorOptions = ApiResponseInit & {
  code: string;
  message: string;
};

function json<TData>(
  body: ApiResponse<TData>,
  init: ApiResponseInit = {},
) {
  return Response.json(body, {
    headers: init.headers,
    status: init.status,
  });
}

export function success<TData>(data: TData, init?: ApiResponseInit) {
  return json({ ok: true, data }, init);
}

export function apiError(
  { code, message, headers, status = 500 }: ApiErrorOptions,
) {
  return json({ ok: false, error: { code, message } }, { headers, status });
}

export function badRequest(
  message = "La solicitud no es valida",
  code = "BAD_REQUEST",
) {
  return apiError({ code, message, status: 400 });
}

export function unauthorized(
  message = "No autenticado",
  code = "UNAUTHORIZED",
) {
  return apiError({ code, message, status: 401 });
}

export function forbidden(
  message = "No autorizado",
  code = "FORBIDDEN",
) {
  return apiError({ code, message, status: 403 });
}

export function notFound(
  message = "Recurso no encontrado",
  code = "NOT_FOUND",
) {
  return apiError({ code, message, status: 404 });
}

export function conflict(
  message = "Conflicto",
  code = "CONFLICT",
) {
  return apiError({ code, message, status: 409 });
}

export function internalError(
  message = "Error interno",
  code = "INTERNAL_ERROR",
) {
  return apiError({ code, message, status: 500 });
}
