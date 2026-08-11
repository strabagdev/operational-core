import { describe, expect, it } from "vitest";

import {
  buildContractsHref,
  getActiveContractAdminModal,
} from "./contract-admin-navigation";

describe("contract administration navigation", () => {
  it("removes only the edit contract query param when closing the edit sheet", () => {
    const href = buildContractsHref(
      "/app/settings/contracts",
      {
        q: "demo",
        status: "ARCHIVED",
        editContract: "contract_1",
        notice: "Cambios guardados.",
      },
      { editContract: undefined },
    );

    expect(href).toBe(
      "/app/settings/contracts?q=demo&status=ARCHIVED&notice=Cambios+guardados.",
    );
  });

  it("opens edit mode without carrying create mode", () => {
    const href = buildContractsHref(
      "/app/settings/contracts",
      {
        q: "demo",
        status: "ACTIVE",
        createContract: "1",
      },
      {
        createContract: undefined,
        editContract: "contract_1",
      },
    );

    expect(href).toBe(
      "/app/settings/contracts?q=demo&status=ACTIVE&editContract=contract_1",
    );
  });

  it("opens archive mode while closing edit and delete modes", () => {
    const href = buildContractsHref(
      "/app/settings/contracts",
      {
        q: "demo",
        status: "ALL",
        deleteContract: "contract_2",
        editContract: "contract_3",
      },
      {
        archiveContract: "contract_1",
        createContract: undefined,
        deleteContract: undefined,
        editContract: undefined,
      },
    );

    expect(href).toBe(
      "/app/settings/contracts?q=demo&status=ALL&archiveContract=contract_1",
    );
  });

  it("opens delete mode while closing archive and edit modes", () => {
    const href = buildContractsHref(
      "/app/settings/contracts",
      {
        q: "demo",
        status: "ARCHIVED",
        archiveContract: "contract_2",
        editContract: "contract_3",
      },
      {
        archiveContract: undefined,
        createContract: undefined,
        deleteContract: "contract_1",
        editContract: undefined,
      },
    );

    expect(href).toBe(
      "/app/settings/contracts?q=demo&status=ARCHIVED&deleteContract=contract_1",
    );
  });

  it("keeps the delete modal open on server error", () => {
    const href = buildContractsHref(
      "/app/settings/contracts",
      {
        q: "demo",
        status: "ARCHIVED",
        deleteContract: "contract_1",
      },
      {
        error: "La confirmación no coincide.",
      },
    );

    expect(href).toBe(
      "/app/settings/contracts?q=demo&status=ARCHIVED&deleteContract=contract_1&error=La+confirmaci%C3%B3n+no+coincide.",
    );
  });

  it("closes modal params on success while preserving filters", () => {
    const href = buildContractsHref(
      "/app/settings/contracts",
      {
        q: "demo",
        status: "ARCHIVED",
        archiveContract: "contract_1",
        deleteContract: "contract_2",
        error: "Error anterior",
      },
      {
        archiveContract: undefined,
        createContract: undefined,
        deleteContract: undefined,
        editContract: undefined,
        error: undefined,
        notice: "Contrato archivado.",
      },
    );

    expect(href).toBe(
      "/app/settings/contracts?q=demo&status=ARCHIVED&notice=Contrato+archivado.",
    );
  });

  it("resolves a single active modal when the URL contains multiple modal params", () => {
    expect(
      getActiveContractAdminModal({
        archiveContract: "contract_3",
        createContract: "1",
        deleteContract: "contract_4",
        editContract: "contract_2",
      }),
    ).toEqual({ type: "create" });

    expect(
      getActiveContractAdminModal({
        archiveContract: "contract_3",
        deleteContract: "contract_4",
        editContract: "contract_2",
      }),
    ).toEqual({ type: "edit", contractId: "contract_2" });

    expect(
      getActiveContractAdminModal({
        archiveContract: "contract_3",
        deleteContract: "contract_4",
      }),
    ).toEqual({ type: "archive", contractId: "contract_3" });
  });
});
