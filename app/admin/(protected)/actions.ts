"use server";

import { redirect } from "next/navigation";
import { clearAdminSession } from "@/lib/admin/session";

export async function logoutAdmin(): Promise<never> {
  await clearAdminSession();
  redirect("/ashik-loves-jannat/login");
}
