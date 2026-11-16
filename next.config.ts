import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseHostname = supabaseUrl
	? new URL(supabaseUrl).hostname
	: undefined;

const nextConfig: NextConfig = {
	poweredByHeader: false,
	experimental: {
		serverActions: {
			bodySizeLimit: "11mb",
		},
	},
	async rewrites() {
		return [
			{ source: "/ashik-loves-jannat", destination: "/admin" },
			{ source: "/ashik-loves-jannat/:path*", destination: "/admin/:path*" },
		];
	},
	images: {
		remotePatterns: [
			...(supabaseHostname ? [{
				protocol: "https" as const,
				hostname: supabaseHostname,
				pathname: "/storage/v1/object/public/book-covers/**",
			}] : []),
			...(supabaseHostname ? [{
				protocol: "https" as const,
				hostname: supabaseHostname,
				pathname: "/storage/v1/object/public/career-banners/**",
			}] : []),
			{
				protocol: "https",
				hostname: "substackcdn.com",
				pathname: "/image/fetch/**",
			},
			{
				protocol: "https",
				hostname: "pbs.twimg.com",
				pathname: "/profile_images/**",
			},
		],
	},
	async headers() {
		const securityHeaders = [
			{ key: "X-Content-Type-Options", value: "nosniff" },
			{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
			{ key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
			{ key: "X-Frame-Options", value: "DENY" },
		];
		if (process.env.NODE_ENV === "production") {
			securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" });
		}
		return [{ source: "/:path*", headers: securityHeaders }];
	},
};

export default nextConfig;