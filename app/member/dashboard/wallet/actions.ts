"use server";

import { requireMemberSession } from "@/lib/member/session";
import { validateActionFormData } from "@/lib/security/guards";

export type WalletPaymentState = { error?: string; success?: string };

export async function submitWalletPaymentAction(previousState: WalletPaymentState, formData: FormData): Promise<WalletPaymentState> {
  validateActionFormData(formData);
  void previousState;
  void formData;
  await requireMemberSession();
  return { error: "Wallet payments are unavailable. Use bKash or Nagad checkout." };
}