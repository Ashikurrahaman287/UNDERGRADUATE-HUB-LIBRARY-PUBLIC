import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendSwiftSms } from "@/lib/member/sms";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

type ScheduledJobsRpcClient = {
  rpc(functionName: "accrue_overdue_fines"): Promise<{
    data: {
      business_date: string;
      subscriptions_expired: number;
      rentals_marked_overdue: number;
      fine_entries_created: number;
      catch_up_rentals_pending: number;
    } | null;
    error: { message: string } | null;
  }>;
  rpc(functionName: "process_member_reminders"): Promise<{
    data: {
      business_date: string;
      subscription_expiring_3d: number;
      subscription_expiring_1d: number;
      subscriptions_expired: number;
      rentals_due: number;
      rentals_overdue: number;
    } | null;
    error: { message: string } | null;
  }>;
};
type QueuedSms = { id: string; member_id: string; title: string; message: string };
type MemberPhone = { id: string; phone: string };
type SmsQueueClient = {
  from(table: "notifications"): {
    select(columns: "id, member_id, title, message"): {
      eq(column: "channel", value: "sms"): {
        eq(column: "status", value: "pending"): {
          lte(column: "scheduled_at", value: string): {
            order(column: "created_at", options: { ascending: boolean }): {
              limit(count: number): PromiseLike<{ data: QueuedSms[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
    update(values: { status: "sent" | "failed"; sent_at: string | null }): {
      eq(column: "id", value: string): { eq(column: "status", value: "pending"): PromiseLike<{ error: { message: string } | null }> };
    };
  };
  from(table: "member_profiles"): {
    select(columns: "id, phone"): {
      in(column: "id", values: string[]): PromiseLike<{ data: MemberPhone[] | null; error: { message: string } | null }>;
    };
  };
};

async function deliverQueuedMemberSms(client: SmsQueueClient): Promise<{ sent: number; failed: number; skipped: boolean }> {
  if (!process.env.SWIFTSMS_API_KEY) return { sent: 0, failed: 0, skipped: true };
  const now = new Date().toISOString();
  const { data: queued, error } = await client.from("notifications")
    .select("id, member_id, title, message")
    .eq("channel", "sms")
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .order("created_at", { ascending: true })
    .limit(20);
  if (error || !queued?.length) return { sent: 0, failed: 0, skipped: false };

  const memberIds = [...new Set(queued.map((notice) => notice.member_id))];
  const { data: members } = await client.from("member_profiles").select("id, phone").in("id", memberIds);
  const phonesByMember = new Map((members ?? []).map((member) => [member.id, member.phone]));
  let sent = 0;
  let failed = 0;
  for (const notice of queued) {
    const phone = phonesByMember.get(notice.member_id);
    let status: "sent" | "failed" = "failed";
    if (phone) {
      try {
        await sendSwiftSms({ phone, message: `${notice.title}: ${notice.message}`.slice(0, 480) });
        status = "sent";
      } catch {
        status = "failed";
      }
    }
    const { error: updateError } = await client.from("notifications").update({
      status,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    }).eq("id", notice.id).eq("status", "pending");
    if (updateError || status === "failed") failed += 1;
    else sent += 1;
  }
  return { sent, failed, skipped: false };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    return NextResponse.json({ ok: false, error: "Scheduled fine accrual is not configured." }, { status: 503 });
  }

  const suppliedAuthorization = Buffer.from(request.headers.get("authorization") ?? "");
  const expectedAuthorization = Buffer.from(`Bearer ${secret}`);
  if (suppliedAuthorization.length !== expectedAuthorization.length || !timingSafeEqual(suppliedAuthorization, expectedAuthorization)) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  try {
    const client = createAdminSupabaseClient() as unknown as ScheduledJobsRpcClient;
    const { data: fineSummary, error: fineError } = await client.rpc("accrue_overdue_fines");
    const { data: reminderSummary, error: reminderError } = await client.rpc("process_member_reminders");
    if (fineError || !fineSummary || reminderError || !reminderSummary) {
      return NextResponse.json({ ok: false, error: "Scheduled processing did not complete." }, { status: 500 });
    }

    const smsSummary = await deliverQueuedMemberSms(createAdminSupabaseClient() as unknown as SmsQueueClient);
    return NextResponse.json({ ok: true, summary: { fines: fineSummary, reminders: reminderSummary, sms: smsSummary } });
  } catch {
    return NextResponse.json({ ok: false, error: "Scheduled processing did not complete." }, { status: 500 });
  }
}
