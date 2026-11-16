"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdminSessionId } from "@/lib/admin/session";
import { validateActionFormData } from "@/lib/security/guards";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

const incomeCategories = [
  "Subscription Fees",
  "Fine Payments",
  "Book Sales",
  "Sponsorships",
  "Others",
] as const;

const expenseCategories = [
  "Book Purchases",
  "Web Hosting / Vercel",
  "Marketing",
  "Operations",
  "Maintenance",
] as const;

function normalizeText(value: string | null, fallback: string): string {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

export async function createFinanceTransactionAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  const adminSessionId = await requireSuperAdminSessionId();
  const rawType = (formData.get("entryType")?.toString() ?? "income");
  const normalizedType: "income" | "expense" = rawType === "expense" ? "expense" : "income";
  const category = formData.get("category")?.toString() ?? "Others";
  const amountRaw = Number(formData.get("amount")?.toString() ?? "0");
  const date = formData.get("transactionDate")?.toString() ?? new Date().toISOString().slice(0, 10);
  const description = normalizeText(formData.get("description")?.toString() ?? null, "Manual finance transaction");
  const paymentMethod = formData.get("paymentMethod")?.toString() ?? "Cash";
  const externalRef = normalizeText(formData.get("externalRef")?.toString() ?? null, "");

  if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
    redirect("/ashik-loves-jannat/finances?status=error");
  }

  const allowedCategories = normalizedType === "income" ? incomeCategories : expenseCategories;
  if (!allowedCategories.some((validCategory) => validCategory === category)) {
    redirect("/ashik-loves-jannat/finances?status=error");
  }

  const client = createAdminSupabaseClient();
  const { error } = await client.from("finance_transactions").insert({
    entry_type: normalizedType,
    category,
    amount_bdt: Number(amountRaw.toFixed(2)),
    transaction_date: date,
    description,
    payment_method: paymentMethod,
    external_ref: externalRef || null,
    created_by_admin_session_id: adminSessionId,
  });

  if (error) {
    redirect("/ashik-loves-jannat/finances?status=error");
  }

  revalidatePath("/admin/finances");
  revalidatePath("/admin/audit");
  redirect("/ashik-loves-jannat/finances?status=created");
}

export async function updateFinanceTransactionAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  const adminSessionId = await requireSuperAdminSessionId();
  const transactionId = formData.get("transactionId")?.toString() ?? "";
  const rawType = (formData.get("entryType")?.toString() ?? "income");
  const normalizedType: "income" | "expense" = rawType === "expense" ? "expense" : "income";
  const category = formData.get("category")?.toString() ?? "Others";
  const amountRaw = Number(formData.get("amount")?.toString() ?? "0");
  const date = formData.get("transactionDate")?.toString() ?? new Date().toISOString().slice(0, 10);
  const description = normalizeText(formData.get("description")?.toString() ?? null, "Manual finance transaction");
  const paymentMethod = formData.get("paymentMethod")?.toString() ?? "Cash";
  const externalRef = normalizeText(formData.get("externalRef")?.toString() ?? null, "");

  if (!transactionId || !Number.isFinite(amountRaw) || amountRaw <= 0) {
    redirect("/ashik-loves-jannat/finances?status=error");
  }

  const allowedCategories = normalizedType === "income" ? incomeCategories : expenseCategories;
  if (!allowedCategories.some((validCategory) => validCategory === category)) {
    redirect("/ashik-loves-jannat/finances?status=error");
  }

  const client = createAdminSupabaseClient();
  const { error } = await client.from("finance_transactions").update({
    entry_type: normalizedType,
    category,
    amount_bdt: Number(amountRaw.toFixed(2)),
    transaction_date: date,
    description,
    payment_method: paymentMethod,
    external_ref: externalRef || null,
    created_by_admin_session_id: adminSessionId,
    updated_at: new Date().toISOString(),
  }).eq("id", transactionId);

  if (error) {
    redirect("/ashik-loves-jannat/finances?status=error");
  }

  revalidatePath("/admin/finances");
  revalidatePath("/admin/audit");
  redirect("/ashik-loves-jannat/finances?status=updated");
}

export async function deleteFinanceTransactionAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  await requireSuperAdminSessionId();
  const transactionId = formData.get("transactionId")?.toString() ?? "";
  if (!transactionId) redirect("/ashik-loves-jannat/finances?status=error");

  const client = createAdminSupabaseClient();
  const { error } = await client.from("finance_transactions").delete().eq("id", transactionId);
  if (error) redirect("/ashik-loves-jannat/finances?status=error");

  revalidatePath("/admin/finances");
  revalidatePath("/admin/audit");
  redirect("/ashik-loves-jannat/finances?status=deleted");
}
