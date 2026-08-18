import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { userAdminDatabaseConnectionMessage } from "@/lib/user-admin";

export function UserAdminDatabaseConnectionState({ retryHref }: { retryHref: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{userAdminDatabaseConnectionMessage}</p>
        <Button asChild variant="outline">
          <Link href={retryHref}>Reintentar</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
