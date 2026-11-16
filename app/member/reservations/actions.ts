"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createMemberSupabaseServerClient, requireMemberSession } from "@/lib/member/session";
import { validateActionFormData } from "@/lib/security/guards";

type ReservationActionClient = {
  rpc(
    functionName: "create_book_reservation" | "cancel_book_reservation",
    args: { p_book_id: string } | { p_reservation_id: string },
  ): Promise<{ data: string | null; error: { message: string } | null }>;
};

function reservationErrorMessage(message: string): string {
  if (message.includes("Complete ID verification")) return "Complete ID verification in My Profile and wait for administrator approval before requesting a book.";
  if (message.includes("member profile")) return "Create your member profile before reserving a book.";
  if (message.includes("already have an active reservation")) return "You already have an active reservation for this book.";
  if (message.includes("reservations are available only")) return "Reservations are available only while a book cannot be borrowed.";
  if (message.includes("active member")) return "Only active members with a current subscription can reserve books.";
  if (message.includes("pending rental request") || message.includes("active rental")) return "You already have a rental request or rental for this book.";
  if (message.includes("book was not found") || message.includes("reservation not found")) return "This book or reservation could not be found.";
  return "The reservation could not be completed. Refresh and try again.";
}

export async function createBookReservationAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  await requireMemberSession();
  const bookId = formData.get("bookId")?.toString();
  if (!bookId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(bookId)) {
    throw new Error("Choose a valid book to reserve.");
  }

  const client = await createMemberSupabaseServerClient() as unknown as ReservationActionClient;
  const { data, error } = await client.rpc("create_book_reservation", { p_book_id: bookId });
  if (error?.message.includes("Complete ID verification")) redirect("/member/dashboard#identity-verification");
  if (error || !data) throw new Error(reservationErrorMessage(error?.message ?? ""));

  revalidatePath("/member/reservations");
  revalidatePath(`/books`);
  redirect("/member/reservations?created=1");
}

export async function cancelBookReservationAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  await requireMemberSession();
  const reservationId = formData.get("reservationId")?.toString();
  if (!reservationId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(reservationId)) {
    throw new Error("Reservation not found.");
  }

  const client = await createMemberSupabaseServerClient() as unknown as ReservationActionClient;
  const { data, error } = await client.rpc("cancel_book_reservation", { p_reservation_id: reservationId });
  if (error || (data !== "cancelled" && data !== "already_cancelled")) {
    throw new Error(reservationErrorMessage(error?.message ?? ""));
  }

  revalidatePath("/member/reservations");
  redirect("/member/reservations?cancelled=1");
}
