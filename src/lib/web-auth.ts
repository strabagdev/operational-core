import bcrypt from "bcrypt";

import { prisma } from "@/lib/prisma";

export async function authorizeWebCredentials(
  credentials: Partial<Record<"email" | "password", unknown>>,
) {
  const email =
    typeof credentials.email === "string"
      ? credentials.email.trim().toLowerCase()
      : "";
  const password =
    typeof credentials.password === "string" ? credentials.password : "";

  if (!email || !password) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user?.passwordHash || user.active === false) {
    return null;
  }

  const isValidPassword = await bcrypt.compare(password, user.passwordHash);

  if (!isValidPassword) {
    return null;
  }

  return {
    email: user.email,
    id: user.id,
    image: user.image,
    name: user.name,
  };
}
