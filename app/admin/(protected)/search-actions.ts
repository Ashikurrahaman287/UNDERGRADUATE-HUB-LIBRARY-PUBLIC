"use server";

import { redirect } from "next/navigation";
import { requireAdminSessionId } from "@/lib/admin/session";
import { setAdminSearchCookie } from "@/lib/admin/search-cookie";
import { validateActionFormData } from "@/lib/security/guards";

export async function searchAdminQueueAction(formData: FormData): Promise<void> {
	await requireAdminSessionId();
	validateActionFormData(formData);
	const key = formData.get("searchKey");
	const query = formData.get("q");
	const routes = {
		membership: { path: "/ashik-loves-jannat/membership-requests", statuses: ["all", "pending", "approved", "rejected"] },
		rental: { path: "/ashik-loves-jannat/rental-requests", statuses: ["all", "pending", "approved", "rejected"] },
		"active-members": { path: "/ashik-loves-jannat/approved-members", statuses: [] },
		members: { path: "/ashik-loves-jannat/members", statuses: ["all", "pending", "active", "rejected", "suspended"] },
		reservations: { path: "/ashik-loves-jannat/reservations", statuses: ["open", "all", "waiting", "notified", "fulfilled", "cancelled", "expired"] },
		fines: { path: "/ashik-loves-jannat/fines", statuses: ["all", "outstanding", "paid", "waived"] },
	} as const;
	if (typeof key !== "string" || !Object.hasOwn(routes, key) || typeof query !== "string" || query.length > 100) {
		redirect("/ashik-loves-jannat");
	}

	const routeKey = key as keyof typeof routes;
	await setAdminSearchCookie(routeKey, query);
	const route = routes[routeKey];
	const params = new URLSearchParams();
	const status = formData.get("status");
	if (status && route.statuses.some((allowedStatus) => allowedStatus === status.toString())) params.set("status", status.toString());
	if (routeKey === "active-members") {
		const institution = formData.get("institution");
		if (typeof institution === "string" && institution.length <= 100 && institution) params.set("institution", institution);
	}
	const queryString = params.toString();
	redirect(queryString ? `${route.path}?${queryString}` : route.path);
}