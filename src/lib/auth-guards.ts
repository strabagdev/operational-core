import { redirect } from "next/navigation";

import { auth } from "@/auth";

export async function requireAuthenticatedUser() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!session?.user || !userId) {
    redirect("/login");
  }

  return {
    ...session.user,
    id: userId,
  };
}
