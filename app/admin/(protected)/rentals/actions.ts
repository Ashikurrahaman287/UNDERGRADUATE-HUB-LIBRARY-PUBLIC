"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSessionId } from "@/lib/admin/session";
import { validateActionFormData } from "@/lib/security/guards";
import { isRentalDueSoon } from "@/lib/member/rental-reminders";
import { sendSwiftSmsBestEffort } from "@/lib/member/sms";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type RentalLifecycleRpcClient = {
  rpc(
    functionName: "handover_rental" | "receive_rental" | "admin_extend_rental_period",
    args: { p_rental_id: string; p_reviewer_session_id: string; p_days?: number },
  ): Promise<{ data: string | null; error: { message: string } | null }>;
};
type RentalDueDateRpcClient = {
  rpc(
    functionName: "admin_extend_rental_due_date",
    args: { p_rental_id: string; p_reviewer_session_id: string; p_custom_days: number | null; p_new_due_date: string | null },
  ): Promise<{ data: string | null; error: { code?: string; message: string } | null }>;
};

type RentalNotificationRecord = {
  status: string;
  subscription_ends_at: string | null;
  returned_at: string | null;
  member: { phone: string | null } | null;
  book: { title: string | null } | null;
};
type RentalNotificationLookup = {
  from(table: "rentals"): {
    select(columns: string): {
      eq(column: "id", value: string): {
        maybeSingle(): PromiseLike<{ data: RentalNotificationRecord | null; error: { message: string } | null }>;
      };
    };
  };
};

async function loadRentalNotificationRecord(rentalId: string): Promise<RentalNotificationRecord | null> {
  try {
    const client = createAdminSupabaseClient() as unknown as RentalNotificationLookup;
    const { data, error } = await client.from("rentals")
      .select("status, subscription_ends_at, returned_at, member:member_profiles!rentals_member_id_fkey(phone), book:books!rentals_book_id_fkey(title)")
      .eq("id", rentalId)
      .maybeSingle();
    if (error) console.error("Could not load rental details for SMS.", error);
    return error ? null : data;
  } catch (error) {
    console.error("Could not load rental details for SMS.", error);
    return null;
  }
}

async function sendRentalEventSms(rentalId: string, messageForTitle: (title: string) => string): Promise<boolean> {
  const rental = await loadRentalNotificationRecord(rentalId);
  if (!rental?.member?.phone || !rental.book?.title) {
    console.error("Rental SMS recipient or book title is unavailable.");
    return false;
  }
  return sendSwiftSmsBestEffort({ phone: rental.member.phone, message: messageForTitle(rental.book.title) });
}

function rentalIdFrom(formData: FormData): string | null {
  const rentalId = formData.get("rentalId")?.toString();
  return rentalId && /^[0-9a-f-]{36}$/i.test(rentalId) ? rentalId : null;
}

function refreshRentalPages(): void {
  revalidatePath("/admin");
  revalidatePath("/admin/rental-requests");
  revalidatePath("/admin/rentals");
  revalidatePath("/member/dashboard");
  revalidatePath("/member/dashboard/my-books");
  revalidatePath("/books");
  revalidatePath("/");
}

export async function handoverRentalAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  const reviewerSessionId = await requireAdminSessionId();
  const rentalId = rentalIdFrom(formData);
  if (!rentalId) redirect("/ashik-loves-jannat/rentals?handover=error");

  const client = createAdminSupabaseClient() as unknown as RentalLifecycleRpcClient;
  const { data: result, error } = await client.rpc("handover_rental", {
    p_rental_id: rentalId,
    p_reviewer_session_id: reviewerSessionId,
  });

  if (error || (result !== "handed_over" && result !== "already_handed_over")) {
    redirect("/ashik-loves-jannat/rentals?handover=error");
  }

  const smsFailed = result === "handed_over"
    ? !(await sendRentalEventSms(rentalId, (title) => `Book '${title}' has been successfully issued to you.`))
    : false;
  refreshRentalPages();
  redirect(`/ashik-loves-jannat/rentals?handover=success${smsFailed ? "&sms=failed" : ""}`);
}

export async function receiveRentalAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  const reviewerSessionId = await requireAdminSessionId();
  const rentalId = rentalIdFrom(formData);
  if (!rentalId) redirect("/ashik-loves-jannat/rentals?receive=error");

  const client = createAdminSupabaseClient() as unknown as RentalLifecycleRpcClient;
  const { data: result, error } = await client.rpc("receive_rental", {
    p_rental_id: rentalId,
    p_reviewer_session_id: reviewerSessionId,
  });

  if (error || !["returned", "returned_with_credit", "already_returned"].includes(result ?? "")) {
    redirect("/ashik-loves-jannat/rentals?receive=error");
  }

  const smsFailed = result !== "already_returned"
    ? !(await sendRentalEventSms(rentalId, (title) => `Book '${title}' has been successfully received/returned.`))
    : false;
  refreshRentalPages();
  redirect(`/ashik-loves-jannat/rentals?receive=${result === "returned_with_credit" ? "credit" : "success"}${smsFailed ? "&sms=failed" : ""}`);
}

export async function sendRentalReminderAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  await requireAdminSessionId();
  const rentalId = rentalIdFrom(formData);
  if (!rentalId) redirect("/ashik-loves-jannat/rentals?reminder=error");

  const rental = await loadRentalNotificationRecord(rentalId);
  if (!rental || rental.status !== "active" || rental.returned_at || !isRentalDueSoon(rental.subscription_ends_at)) {
    redirect("/ashik-loves-jannat/rentals?reminder=error");
  }
  if (!rental.member?.phone || !rental.book?.title) redirect("/ashik-loves-jannat/rentals?reminder=failed");

  const sent = await sendSwiftSmsBestEffort({
    phone: rental.member.phone,
    message: `Reminder: Your rental period for '${rental.book.title}' is ending soon. Please return the book or renew to avoid fines.`,
  });
  revalidatePath("/admin/rentals");
  redirect(`/ashik-loves-jannat/rentals?reminder=${sent ? "sent" : "failed"}`);
}

export type RentalDueDateExtensionState = { error?: string; success?: string };

export async function extendRentalPeriodAction(_previousState: RentalDueDateExtensionState, formData: FormData): Promise<RentalDueDateExtensionState> {
  validateActionFormData(formData);
  const reviewerSessionId = await requireAdminSessionId();
  const rentalId = rentalIdFrom(formData);
  const days = Number(formData.get("days"));
  if (!rentalId || ![7, 14, 30].includes(days)) return { error: "Choose a valid rental extension." };

  const client = createAdminSupabaseClient() as unknown as RentalLifecycleRpcClient;
  const { data: result, error } = await client.rpc("admin_extend_rental_period", {
    p_rental_id: rentalId,
    p_days: days,
    p_reviewer_session_id: reviewerSessionId,
  });
  if (error || result !== "extended") return { error: "The rental due date could not be extended. Refresh and try again." };

  refreshRentalPages();
  return { success: "Rental due date extended." };
}

export async function extendRentalDueDateAction(_previousState: RentalDueDateExtensionState, formData: FormData): Promise<RentalDueDateExtensionState> {
  validateActionFormData(formData);
  const reviewerSessionId = await requireAdminSessionId();
  const rentalId = rentalIdFrom(formData);
  const mode = formData.get("extensionMode")?.toString() ?? "";
  if (!rentalId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(rentalId)) {
    return { error: "The rental record could not be found." };
  }

  let customDays: number | null = null;
  let newDueDate: string | null = null;
  if (mode === "days") {
    const rawDays = formData.get("customDays")?.toString().trim() ?? "";
    customDays = rawDays ? Number(rawDays) : NaN;
    if (!Number.isInteger(customDays) || customDays < 1 || customDays > 3650) {
      return { error: "Enter a whole number of days from 1 to 3,650." };
    }
  } else if (mode === "date") {
    const rawDate = formData.get("newDueDate")?.toString().trim() ?? "";
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? new Date(`${rawDate}T00:00:00.000Z`) : null;
    if (!parsedDate || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== rawDate) {
      return { error: "Choose a valid due date." };
    }
    newDueDate = rawDate;
  } else {
    return { error: "Choose days to add or a custom due date." };
  }

  const client = createAdminSupabaseClient() as unknown as RentalDueDateRpcClient;
  const { data: result, error } = await client.rpc("admin_extend_rental_due_date", {
    p_rental_id: rentalId,
    p_reviewer_session_id: reviewerSessionId,
    p_custom_days: customDays,
    p_new_due_date: newDueDate,
  });
  if (error || result !== "extended") {
    console.error("[rental-due-date] Extension failed", { rentalId, code: error?.code ?? "unknown", message: error?.message ?? result });
    return { error: error?.message === "The new due date must be later than the current due date."
      ? "Choose a due date later than the current due date."
      : "The rental due date could not be updated. Refresh and try again." };
  }

  refreshRentalPages();
  return { success: "Rental due date updated successfully!" };
}