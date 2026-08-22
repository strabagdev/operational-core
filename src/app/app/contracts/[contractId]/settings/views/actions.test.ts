import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  appViewFieldErrors,
  createAppView,
  friendlyAppViewError,
  updateAppView,
} from "@/lib/app-views";
import { requireAuthenticatedUser } from "@/lib/auth-guards";

import {
  createAppViewAction,
  updateAppViewAction,
  type AppViewActionState,
} from "./actions";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth-guards", () => ({
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/app-views", () => ({
  appViewFieldErrors: vi.fn(),
  createAppView: vi.fn(),
  friendlyAppViewError: vi.fn(),
  getAppViewInput: vi.fn((formData: FormData) => ({
    common: {
      active: true,
      icon: "",
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      sortOrder: 0,
      type: String(formData.get("type") ?? "RECORDS"),
    },
    rawConfig: Object.fromEntries(formData.entries()),
  })),
  setAppViewActive: vi.fn(),
  updateAppView: vi.fn(),
}));

const createAppViewMock = vi.mocked(createAppView);
const updateAppViewMock = vi.mocked(updateAppView);
const friendlyAppViewErrorMock = vi.mocked(friendlyAppViewError);
const appViewFieldErrorsMock = vi.mocked(appViewFieldErrors);
const redirectMock = vi.mocked(redirect);
const revalidatePathMock = vi.mocked(revalidatePath);
const requireAuthenticatedUserMock = vi.mocked(requireAuthenticatedUser);

describe("AppView settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserMock.mockResolvedValue({ id: "user_1" } as never);
    friendlyAppViewErrorMock.mockReturnValue("No fue posible guardar la vista.");
    appViewFieldErrorsMock.mockReturnValue(undefined);
  });

  it("returns validation state for invalid create without redirecting to the list", async () => {
    const error = new Error("Selecciona el estado por defecto de checking.");

    createAppViewMock.mockRejectedValue(error);
    friendlyAppViewErrorMock.mockReturnValue("Selecciona el estado por defecto de checking.");
    appViewFieldErrorsMock.mockReturnValue({
      defaultCheckInOptionId: ["Selecciona el estado por defecto de checking."],
    });

    const result = await createAppViewAction("contract_1", initialState(), appViewFormData({
      name: "Registro de Asistencia",
      personFieldId: "person_field",
      statusFieldId: "status_field",
      defaultCheckInOptionId: "present_option",
      type: "WORKFLOW",
    }));

    expect(result).toEqual({
      success: false,
      message: "Selecciona el estado por defecto de checking.",
      fieldErrors: {
        defaultCheckInOptionId: ["Selecciona el estado por defecto de checking."],
      },
      values: expect.objectContaining({
        name: "Registro de Asistencia",
        personFieldId: "person_field",
        statusFieldId: "status_field",
        defaultCheckInOptionId: "present_option",
        type: "WORKFLOW",
      }),
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("returns validation state for invalid edit and preserves selected inputs", async () => {
    const error = new Error("Este campo debe relacionar Asistencias con Personas.");

    updateAppViewMock.mockRejectedValue(error);
    friendlyAppViewErrorMock.mockReturnValue("Este campo debe relacionar Asistencias con Personas.");
    appViewFieldErrorsMock.mockReturnValue({
      personFieldId: ["Este campo debe relacionar Asistencias con Personas."],
    });

    const result = await updateAppViewAction("contract_1", "view_1", initialState(), appViewFormData({
      name: "Registro de Asistencia",
      personFieldId: "person_field",
      defaultCheckInOptionId: "present_option",
      sourceEntityTypeId: "people",
      targetEntityTypeId: "attendance",
      type: "WORKFLOW",
    }));

    expect(result).toMatchObject({
      success: false,
      fieldErrors: {
        personFieldId: ["Este campo debe relacionar Asistencias con Personas."],
      },
      values: {
        active: "on",
        dateFieldId: "date_field",
        name: "Registro de Asistencia",
        observationFieldId: "observation_field",
        personFieldId: "person_field",
        defaultCheckInOptionId: "present_option",
        slug: "registro-de-asistencia",
        sortOrder: "0",
        sourceEntityTypeId: "people",
        statusFieldId: "status_field",
        targetEntityTypeId: "attendance",
        type: "WORKFLOW",
        workflowKey: "attendance",
      },
    });
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects only after a successful create", async () => {
    createAppViewMock.mockResolvedValue({ id: "view_1" } as never);

    await expect(
      createAppViewAction("contract_1", initialState(), appViewFormData()),
    ).rejects.toThrow("NEXT_REDIRECT:/app/contracts/contract_1/settings/views/view_1");

    expect(revalidatePathMock).toHaveBeenCalledWith("/app/contracts/contract_1/settings/views");
    expect(redirectMock).toHaveBeenCalledWith("/app/contracts/contract_1/settings/views/view_1");
  });
});

function initialState(): AppViewActionState {
  return { success: false };
}

function appViewFormData(overrides: Record<string, string> = {}) {
  const form = new FormData();
  const values = {
    active: "on",
    dateFieldId: "date_field",
    name: "Registro de Asistencia",
    observationFieldId: "observation_field",
    personFieldId: "person_field",
    defaultCheckInOptionId: "present_option",
    slug: "registro-de-asistencia",
    sortOrder: "0",
    sourceEntityTypeId: "people",
    statusFieldId: "status_field",
    targetEntityTypeId: "attendance",
    type: "WORKFLOW",
    workflowKey: "attendance",
    ...overrides,
  };

  for (const [key, value] of Object.entries(values)) {
    form.set(key, value);
  }

  return form;
}
