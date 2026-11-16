import { redirect } from "next/navigation";

export default function MyBooksRouteAlias() {
  redirect("/member/dashboard/my-books");
}