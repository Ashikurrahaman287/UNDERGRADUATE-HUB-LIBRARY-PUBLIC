const memberOrigin = "https://member.invalid";

export function getSafeMemberDestination(value: string | null | undefined): string | null {
  if (!value || value.length > 2048 || /[\r\n]/.test(value)) return null;

  try {
    const destination = new URL(value, memberOrigin);
    const isMemberDestination = destination.pathname.startsWith("/member/")
      && !["/member/login", "/member/verify", "/member/logout"].includes(destination.pathname);
    const isCareerDestination = /^\/careers\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(destination.pathname);
    const isCareerHistoryDestination = destination.pathname === "/careers/my-applications";
    if (destination.origin !== memberOrigin || (!isMemberDestination && !isCareerDestination && !isCareerHistoryDestination)) return null;
    return `${destination.pathname}${destination.search}`;
  } catch {
    return null;
  }
}