import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { type ContractStatus } from "@prisma/client";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getContractAdministration } from "@/lib/contract-admin";
import {
  contractStatusLabels,
  parseContractAdministrationStatus,
} from "@/lib/contract-status";
import {
  archiveContractAction,
  createContractAction,
  deleteContractAction,
  restoreContractAction,
  updateContractAction,
} from "./actions";
import { ArchiveContractDialog } from "./archive-contract-dialog";
import { ContractFormSheet } from "./contract-form-sheet";
import { DeleteContractForm } from "./delete-contract-form";
import {
  buildContractsHref,
  getActiveContractAdminModal,
} from "@/lib/contract-admin-navigation";

type SearchParams = {
  q?: string;
  status?: string;
  archiveContract?: string;
  createContract?: string;
  editContract?: string;
  deleteContract?: string;
  error?: string;
  notice?: string;
};

export default async function ContractAdministrationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const basePath = "/app/settings/contracts";
  const status = parseContractAdministrationStatus(params.status);
  const data = await getContractAdministration({
    userId: session.user.id,
    query: params.q,
    status,
  });

  if (data.organizations.length === 0) {
    notFound();
  }

  const closeHref = buildContractsHref(basePath, params, {
    archiveContract: undefined,
    createContract: undefined,
    deleteContract: undefined,
    error: undefined,
    editContract: undefined,
  });
  const createHref = buildContractsHref(basePath, params, {
    archiveContract: undefined,
    createContract: "1",
    deleteContract: undefined,
    error: undefined,
    editContract: undefined,
    notice: undefined,
  });
  const activeModal = getActiveContractAdminModal(params);
  const createOpen = activeModal.type === "create";
  const editingContract = activeModal.type === "edit"
    ? data.contracts.find((contract) => contract.id === activeModal.contractId)
    : undefined;
  const archivingContract = activeModal.type === "archive"
    ? data.contracts.find((contract) => contract.id === activeModal.contractId)
    : undefined;
  const deletingContract = activeModal.type === "delete"
    ? data.contracts.find((contract) => contract.id === activeModal.contractId)
    : undefined;

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Contratos</h1>
          <p className="text-sm text-muted-foreground">
            Administra los contratos disponibles para operación.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button asChild variant="outline">
            <Link href="/app">Volver</Link>
          </Button>
          <Button asChild>
            <Link href={createHref}>Nuevo contrato</Link>
          </Button>
        </div>
      </header>

      {params.error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{params.error}</p>
          </CardContent>
        </Card>
      ) : null}
      {params.notice ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{params.notice}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <form className="grid gap-3 md:grid-cols-[1fr_180px_auto]" method="get">
            <input
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
              defaultValue={params.q ?? ""}
              name="q"
              placeholder="Buscar por nombre o código"
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              defaultValue={status}
              name="status"
            >
              <option value="ACTIVE">Activos</option>
              <option value="INACTIVE">Inactivos</option>
              <option value="ARCHIVED">Archivados</option>
              <option value="ALL">Todos</option>
            </select>
            <Button type="submit" variant="outline">
              Filtrar
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="grid gap-3">
        {data.contracts.length > 0 ? (
          data.contracts.map((contract) => (
            <Card className={contract.status === "ARCHIVED" ? "opacity-75" : ""} key={contract.id}>
              <CardContent className="grid gap-4 pt-6 md:grid-cols-[1fr_auto] md:items-center">
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{contract.name}</h2>
                    <StatusBadge status={contract.status} />
                  </div>
                  <div className="grid gap-1 text-sm text-muted-foreground md:grid-cols-2">
                    <span>Código: {contract.code}</span>
                    <span>Organización: {contract.organization.name}</span>
                    <span>Creado: {contract.createdAt.toLocaleDateString("es-CL")}</span>
                    <span>Actualizado: {contract.updatedAt.toLocaleDateString("es-CL")}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button aria-label={`Más acciones para ${contract.name}`} size="icon" variant="outline">
                        <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                      <DropdownMenuItem asChild>
                        <Link
                          href={buildContractsHref(basePath, params, {
                            archiveContract: undefined,
                            createContract: undefined,
                            deleteContract: undefined,
                            error: undefined,
                            editContract: contract.id,
                            notice: undefined,
                          })}
                        >
                          Editar
                        </Link>
                      </DropdownMenuItem>
                      {contract.status === "ARCHIVED" ? (
                        <DropdownMenuItem asChild>
                          <form action={restoreContractAction.bind(null, contract.id)}>
                            <input name="returnTo" type="hidden" value={closeHref} />
                            <button className="w-full text-left" type="submit">
                              Restaurar
                            </button>
                          </form>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem asChild>
                          <Link
                            href={buildContractsHref(basePath, params, {
                              archiveContract: contract.id,
                              createContract: undefined,
                              deleteContract: undefined,
                              error: undefined,
                              editContract: undefined,
                              notice: undefined,
                            })}
                          >
                            Archivar
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {contract.status === "ARCHIVED" ? (
                        <DropdownMenuItem asChild>
                          <Link
                            className="text-destructive focus:text-destructive"
                            href={buildContractsHref(basePath, params, {
                              archiveContract: undefined,
                              createContract: undefined,
                              deleteContract: contract.id,
                              error: undefined,
                              editContract: undefined,
                              notice: undefined,
                            })}
                          >
                            Eliminar contrato
                          </Link>
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                No hay contratos para estos filtros.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      {createOpen ? (
        <ContractFormSheet
          action={createContractAction}
          closeHref={closeHref}
          organizations={data.organizations}
          returnTo={createHref}
          successTo={closeHref}
        />
      ) : null}
      {editingContract ? (
        <ContractFormSheet
          action={updateContractAction.bind(null, editingContract.id)}
          closeHref={closeHref}
          contract={{
            id: editingContract.id,
            name: editingContract.name,
            code: editingContract.code,
            status: editingContract.status,
            organizationId: editingContract.organizationId,
          }}
          organizations={data.organizations}
          returnTo={buildContractsHref(basePath, params, {
            error: undefined,
            editContract: editingContract.id,
            notice: undefined,
          })}
          successTo={closeHref}
        />
      ) : null}
      {archivingContract ? (
        <ArchiveContractDialog
          action={archiveContractAction.bind(null, archivingContract.id)}
          closeHref={closeHref}
          contractName={archivingContract.name}
          errorMessage={params.archiveContract === archivingContract.id ? params.error : undefined}
          returnTo={buildContractsHref(basePath, params, {
            archiveContract: archivingContract.id,
            createContract: undefined,
            deleteContract: undefined,
            error: undefined,
            editContract: undefined,
            notice: undefined,
          })}
          successTo={buildContractsHref(basePath, params, {
            archiveContract: undefined,
            createContract: undefined,
            deleteContract: undefined,
            editContract: undefined,
            error: undefined,
            notice: undefined,
          })}
        />
      ) : null}
      {deletingContract?.status === "ARCHIVED" ? (
        <DeleteContractForm
          action={deleteContractAction.bind(null, deletingContract.id)}
          closeHref={closeHref}
          contract={{
            name: deletingContract.name,
            code: deletingContract.code,
            organizationName: deletingContract.organization.name,
          }}
          errorMessage={params.deleteContract === deletingContract.id ? params.error : undefined}
          returnTo={buildContractsHref(basePath, params, {
            archiveContract: undefined,
            createContract: undefined,
            deleteContract: deletingContract.id,
            error: undefined,
            editContract: undefined,
            notice: undefined,
          })}
          successTo={buildContractsHref(basePath, params, {
            archiveContract: undefined,
            createContract: undefined,
            deleteContract: undefined,
            editContract: undefined,
            error: undefined,
            notice: undefined,
          })}
        />
      ) : null}
    </main>
  );
}

function StatusBadge({ status }: { status: ContractStatus }) {
  const className =
    status === "ACTIVE"
      ? "border-transparent bg-secondary text-secondary-foreground"
      : status === "INACTIVE"
        ? "border-border bg-muted text-muted-foreground"
        : "border-border bg-background text-muted-foreground";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {contractStatusLabels[status]}
    </span>
  );
}
