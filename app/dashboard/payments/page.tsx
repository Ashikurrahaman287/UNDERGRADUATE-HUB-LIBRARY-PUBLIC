import { redirect } from "next/navigation";

export default function PaymentsRouteAlias() {
  redirect("/member/dashboard/payments");
}