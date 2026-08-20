import type { DefaultSession } from "next-auth";
import type { PlatformRole } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & {
      id?: string;
      platformRole?: PlatformRole;
    };
  }

  interface User {
    platformRole?: PlatformRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    platformRole?: PlatformRole;
  }
}
