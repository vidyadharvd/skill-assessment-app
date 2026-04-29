import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/server/auth/options";

export function getSession() {
  return getServerSession(authOptions);
}

export async function requireUser() {
  const session = await getSession();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session.user;
}
