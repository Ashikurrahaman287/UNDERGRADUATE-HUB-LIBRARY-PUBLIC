import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const cookieSettings = {
	membership: {
		name: "uhl-admin-membership-search",
		path: "/ashik-loves-jannat/membership-requests",
	},
	rental: {
		name: "uhl-admin-rental-search",
		path: "/ashik-loves-jannat/rental-requests",
	},
	"active-members": {
		name: "uhl-admin-active-members-search",
		path: "/ashik-loves-jannat/approved-members",
	},
	members: {
		name: "uhl-admin-members-search",
		path: "/ashik-loves-jannat/members",
	},
	reservations: {
		name: "uhl-admin-reservations-search",
		path: "/ashik-loves-jannat/reservations",
	},
	fines: {
		name: "uhl-admin-fines-search",
		path: "/ashik-loves-jannat/fines",
	},
} as const;

type SearchKey = keyof typeof cookieSettings;

function encryptionKey(): Buffer {
	const secret = process.env.ADMIN_SESSION_SECRET;
	if (!secret || Buffer.byteLength(secret) < 32) throw new Error("The admin session is not configured.");
	return createHash("sha256").update(secret).digest();
}

function encrypt(value: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
	const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
	return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value: string): string | null {
	try {
		if (value.length > 512) return null;
		const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
		if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !encrypted) return null;
		const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
	} catch {
		return null;
	}
}

export async function setAdminSearchCookie(key: SearchKey, value: string): Promise<void> {
	const settings = cookieSettings[key];
	(await cookies()).set(settings.name, encrypt(value), {
		httpOnly: true,
		secure: true,
		sameSite: "strict",
		path: settings.path,
		maxAge: 300,
	});
}

export async function getAdminSearchCookie(key: SearchKey): Promise<string> {
	const settings = cookieSettings[key];
	const value = (await cookies()).get(settings.name)?.value;
	return value ? decrypt(value) ?? "" : "";
}