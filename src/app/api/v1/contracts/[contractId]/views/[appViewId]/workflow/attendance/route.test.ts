import { describe, expect, it, vi } from "vitest";

import { requireApiContractAccess } from "@/lib/api-auth";
import {
  getAttendanceWorkflowDay,
  saveAttendanceWorkflowDay,
} from "@/lib/attendance-workflow";

import { GET, POST } from "./route";

vi.mock("@/lib/api-auth", () => ({
  requireApiContractAccess: vi.fn(),
}));

vi.mock("@/lib/attendance-workflow", () => ({
  getAttendanceWorkflowDay: vi.fn(),
  saveAttendanceWorkflowDay: vi.fn(),
}));

const requireApiContractAccessMock = vi.mocked(requireApiContractAccess);
const getAttendanceWorkflowDayMock = vi.mocked(getAttendanceWorkflowDay);
const saveAttendanceWorkflowDayMock = vi.mocked(saveAttendanceWorkflowDay);

describe("attendance workflow route", () => {
  it("returns attendance workflow day data", async () => {
    requireApiContractAccessMock.mockResolvedValue(apiAccess() as never);
    getAttendanceWorkflowDayMock.mockResolvedValue({
      ok: true,
      data: {
        appView: { id: "view_1", name: "Asistencia", slug: "asistencia" },
        date: "2026-08-22",
        items: [],
        sourceEntityType: { id: "people", name: "Personas" },
        targetEntityType: { id: "attendance", name: "Asistencias" },
      },
    } as never);

    const response = await GET(
      new Request("http://localhost/api/v1/contracts/contract_1/views/view_1/workflow/attendance?date=2026-08-22"),
      { params: Promise.resolve({ appViewId: "view_1", contractId: "contract_1" }) },
    );

    expect(response.status).toBe(200);
    expect(getAttendanceWorkflowDayMock).toHaveBeenCalledWith({
      appViewId: "view_1",
      contractId: "contract_1",
      date: "2026-08-22",
      userId: "user_1",
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { date: "2026-08-22" },
    });
  });

  it("saves attendance workflow entries", async () => {
    requireApiContractAccessMock.mockResolvedValue(apiAccess() as never);
    saveAttendanceWorkflowDayMock.mockResolvedValue({
      ok: true,
      data: {
        appView: { id: "view_1", name: "Asistencia", slug: "asistencia" },
        date: "2026-08-22",
        results: [{ personRecordId: "person_1", recordId: "attendance_1", result: "CREATED" }],
      },
    } as never);
    const body = {
      date: "2026-08-22",
      entries: [{ personRecordId: "person_1", status: "PRESENTE" }],
    };

    const response = await POST(
      new Request("http://localhost/api/v1/contracts/contract_1/views/view_1/workflow/attendance", {
        body: JSON.stringify(body),
        method: "POST",
      }),
      { params: Promise.resolve({ appViewId: "view_1", contractId: "contract_1" }) },
    );

    expect(response.status).toBe(200);
    expect(saveAttendanceWorkflowDayMock).toHaveBeenCalledWith({
      appId: "app_1",
      appViewId: "view_1",
      body,
      contractId: "contract_1",
      userId: "user_1",
    });
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        results: [{ result: "CREATED" }],
      },
    });
  });
});

function apiAccess() {
  return {
    ok: true,
    context: {
      app: { id: "app_1" },
      contract: { id: "contract_1" },
      user: { id: "user_1" },
    },
  };
}
