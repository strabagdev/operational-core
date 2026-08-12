import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { isInitialSetupRequired } from "@/lib/setup";

export default async function Home() {
  const [session, setupRequired] = await Promise.all([
    auth(),
    isInitialSetupRequired(),
  ]);

  redirect(setupRequired ? "/setup" : session ? "/app" : "/login");
}
