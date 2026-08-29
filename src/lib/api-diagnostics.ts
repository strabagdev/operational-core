import { createHash, randomUUID } from "node:crypto";

const OPCO_REQUEST_ID_HEADER = "X-Opco-Request-Id";

export type ApiServerTiming = {
  finish(result: string, status?: number): string;
  mark(phase: string): void;
  setScope(scope: { appViewId?: string; contractId?: string }): void;
};

export function createApiServerTiming(logLabel: string): ApiServerTiming {
  const startedAt = Date.now();
  const phases: Record<string, number> = {};
  let scope: { appView: string; contract: string } = { appView: "unknown", contract: "unknown" };

  return {
    finish(result: string, status?: number) {
      const totalDurationMs = Date.now() - startedAt;
      const phaseDurations = phaseDurationMs(phases, totalDurationMs);
      const slowestPhase = Object.entries(phaseDurations)
        .sort((left, right) => right[1] - left[1])[0] ?? null;

      console.info(logLabel, {
        appView: scope.appView,
        contract: scope.contract,
        phaseDurations,
        phases,
        result,
        slowestPhase: slowestPhase ? { durationMs: slowestPhase[1], phase: slowestPhase[0] } : null,
        status: status ?? null,
        totalDurationMs,
      });

      return serializeServerTiming({
        phases: phaseDurations,
        result,
        totalDurationMs,
      });
    },
    mark(phase: string) {
      if (/^[A-Za-z0-9_-]{1,40}$/.test(phase)) {
        phases[phase] = Date.now() - startedAt;
      }
    },
    setScope(nextScope) {
      scope = {
        appView: nextScope.appViewId ? fingerprint(nextScope.appViewId) : "unknown",
        contract: nextScope.contractId ? fingerprint(nextScope.contractId) : "unknown",
      };
    },
  };
}

export function applyApiDiagnosticsHeaders(response: Response, request: Request, serverTiming?: string) {
  response.headers.set(OPCO_REQUEST_ID_HEADER, getApiDiagnosticRequestId(request));

  if (serverTiming) {
    response.headers.set("Server-Timing", serverTiming);
  }

  return response;
}

function getApiDiagnosticRequestId(request: Request) {
  const provided = request.headers.get(OPCO_REQUEST_ID_HEADER);

  return sanitizeApiDiagnosticRequestId(provided) ?? `srv_${randomUUID()}`;
}

function sanitizeApiDiagnosticRequestId(value: string | null | undefined) {
  if (!value || !/^[A-Za-z0-9._:-]{1,96}$/.test(value)) {
    return null;
  }

  return value;
}

function serializeServerTiming({
  phases,
  result,
  totalDurationMs,
}: {
  phases: Record<string, number>;
  result: string;
  totalDurationMs: number;
}) {
  const phaseMetrics = Object.entries(phases)
    .filter(([phase, duration]) => /^[A-Za-z0-9_-]{1,40}$/.test(phase) && Number.isFinite(duration))
    .slice(0, 12)
    .map(([phase, duration]) => `${phase};dur=${Math.round(duration)}`);
  const safeResult = /^[A-Za-z0-9_-]{1,40}$/.test(result) ? result : "unknown";

  return [
    `total;dur=${Math.round(totalDurationMs)}`,
    `result;desc="${safeResult}"`,
    ...phaseMetrics,
  ].join(", ");
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function phaseDurationMs(phases: Record<string, number>, totalDurationMs: number) {
  const entries = Object.entries(phases)
    .filter(([, offset]) => Number.isFinite(offset))
    .sort((left, right) => left[1] - right[1]);
  const durations: Record<string, number> = {};
  let previousOffset = 0;
  let previousPhase = "route_start";

  for (const [phase, offset] of entries) {
    durations[previousPhase] = Math.max(0, offset - previousOffset);
    previousOffset = offset;
    previousPhase = phase;
  }

  durations[previousPhase] = Math.max(0, totalDurationMs - previousOffset);

  return durations;
}
