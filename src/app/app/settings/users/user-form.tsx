import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type UserFormValues = {
  active?: boolean;
  email?: string;
  name?: string | null;
  role?: "ADMIN" | "MEMBER";
};

export function UserForm({
  action,
  passwordLabel,
  passwordRequired,
  returnTo,
  submitLabel,
  successTo,
  title,
  values = {},
}: {
  action: (formData: FormData) => void | Promise<void>;
  passwordLabel: string;
  passwordRequired?: boolean;
  returnTo: string;
  submitLabel: string;
  successTo: string;
  title: string;
  values?: UserFormValues;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <input name="returnTo" type="hidden" value={returnTo} />
          <input name="successTo" type="hidden" value={successTo} />
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Nombre
              <input
                autoComplete="name"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                defaultValue={values.name ?? ""}
                name="name"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Email
              <input
                autoComplete="email"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                defaultValue={values.email ?? ""}
                name="email"
                required
                type="email"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {passwordLabel}
              <input
                autoComplete="new-password"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-ring focus-visible:ring-2"
                minLength={8}
                name="password"
                required={passwordRequired}
                type="password"
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Rol
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={values.role ?? "MEMBER"}
                name="role"
              >
                <option value="MEMBER">MEMBER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Estado
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={values.active === false ? "inactive" : "active"}
                name="active"
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button asChild type="button" variant="outline">
              <Link href="/app/settings/users">Cancelar</Link>
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
