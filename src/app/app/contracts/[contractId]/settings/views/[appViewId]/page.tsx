import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  appViewConfigDiagnostic,
  getAuthorizedAppView,
  getAppViewTypeLabel,
  isExpectedAppViewConfigParseError,
  logAppViewConfigDiagnostic,
  parseAppViewConfig,
} from "@/lib/app-views";

import { DiagnosticReferenceCopyButton } from "../diagnostic-reference-copy-button";
import { updateAppViewAction } from "../actions";
import { AppViewForm } from "../app-view-form";

export default async function AppViewDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ appViewId: string; contractId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { appViewId, contractId } = await params;
  const data = await getAuthorizedAppView(contractId, appViewId, session.user.id);

  if (!data) {
    notFound();
  }

  const { error, notice } = await searchParams;

  const isPanel = data.appView.type === "PANEL";
  const parsedAppViews = data.appViews.flatMap((appView) => {
    if (appView.id === data.appView.id) {
      return [];
    }

    try {
      return [{
        active: appView.active,
        config: parseAppViewConfig(appView),
        id: appView.id,
        name: appView.name,
        type: appView.type,
      }];
    } catch (error) {
      if (!isExpectedAppViewConfigParseError(error)) {
        throw error;
      }

      const diagnostic = appViewConfigDiagnostic({ error, view: appView });

      if (diagnostic) {
        logAppViewConfigDiagnostic({ diagnostic, view: appView });
      }

      return [];
    }
  });

  let currentConfig: ReturnType<typeof parseAppViewConfig> | null = null;
  let invalidDiagnostic: ReturnType<typeof appViewConfigDiagnostic> = null;

  try {
    currentConfig = parseAppViewConfig(data.appView);
  } catch (error) {
    if (!isExpectedAppViewConfigParseError(error)) {
      throw error;
    }

    invalidDiagnostic = appViewConfigDiagnostic({ error, view: data.appView });

    if (invalidDiagnostic) {
      logAppViewConfigDiagnostic({ diagnostic: invalidDiagnostic, view: data.appView });
    }
  }

  return (
    <div className={isPanel ? "grid w-full gap-6" : "grid max-w-3xl gap-6"}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{data.appView.name}</h1>
          <p className="text-sm text-muted-foreground">
            Configuración de experiencia para Opco Client.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/app/contracts/${contractId}/settings/views`}>Volver</Link>
        </Button>
      </header>

      <ActionMessage error={error} notice={notice} />

      {invalidDiagnostic ? (
        <Card>
          <CardHeader>
            <CardTitle>Configuración incompatible o inválida</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2 text-sm text-muted-foreground">
              <p>
                Esta experiencia conserva su identidad, pero su configuración guardada no puede cargarse de forma segura.
              </p>
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-foreground">Nombre</dt>
                  <dd>{data.appView.name}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Tipo</dt>
                  <dd>{getAppViewTypeLabel(data.appView.type)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Estado</dt>
                  <dd>Configuración incompatible o inválida</dd>
                </div>
                <div>
                  <dt className="font-medium text-foreground">Detalle</dt>
                  <dd>{invalidDiagnostic.explanation}</dd>
                </div>
              </dl>
            </div>
            <div className="flex flex-wrap gap-2">
              <DiagnosticReferenceCopyButton reference={invalidDiagnostic.reference} />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {currentConfig ? (
      <Card className={isPanel ? "w-full" : undefined}>
        <CardHeader>
          <CardTitle>Datos de la experiencia</CardTitle>
        </CardHeader>
        <CardContent>
          <AppViewForm
            action={updateAppViewAction.bind(null, contractId, appViewId)}
            appViews={parsedAppViews}
            entityTypes={data.entityTypes}
            initialValues={{
              active: data.appView.active,
              config: currentConfig,
              icon: data.appView.icon,
              name: data.appView.name,
              slug: data.appView.slug,
              sortOrder: data.appView.sortOrder,
              type: data.appView.type,
            }}
            submitLabel="Guardar experiencia"
          />
        </CardContent>
      </Card>
      ) : null}
    </div>
  );
}

function ActionMessage({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) {
    return null;
  }

  const message = error ? safeActionMessage(error) : notice;

  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

function safeActionMessage(message: string) {
  return /ZodError|Prisma|too_small|Too small|expected array|path|stack/i.test(message)
    ? "Revisa los datos de la experiencia."
    : message;
}
