export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminBookReview = {
  review_id: string;
  author_name: string;
  rating: number;
  comment: string;
  is_verified: boolean;
};

export type BookRow = {
  id: string;
  slug: string;
  book_number: string | null;
  title: string;
  author: string;
  category_id: string;
  subcategory: string | null;
  description: string;
  cover_path: string | null;
  cover_image_url: string | null;
  edition: string | null;
  language: string | null;
  isbn: string | null;
  publication_year: number | null;
  availability: "available" | "limited" | "unavailable";
  featured: boolean;
  tags: string[];
  reviews: AdminBookReview[];
  added_at: string;
  updated_at: string;
  is_active: boolean;
};

type CategoryInsert = Omit<CategoryRow, "id" | "created_at" | "updated_at" | "is_active"> & Partial<Pick<CategoryRow, "id" | "created_at" | "updated_at" | "is_active">>;
type BookInsert = Omit<BookRow, "id" | "added_at" | "updated_at" | "is_active" | "featured" | "tags" | "reviews" | "availability" | "subcategory" | "cover_path" | "cover_image_url" | "edition" | "language" | "isbn" | "publication_year" | "book_number"> & Partial<Pick<BookRow, "id" | "added_at" | "updated_at" | "is_active" | "featured" | "tags" | "reviews" | "availability" | "subcategory" | "cover_path" | "cover_image_url" | "edition" | "language" | "isbn" | "publication_year" | "book_number">>;
type AdminSessionRow = {
  id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  last_seen_at: string;
  is_super_admin: boolean;
};
type AdminLoginAttemptRow = {
  identifier_hash: string;
  window_started_at: string;
  failed_attempts: number;
  locked_until: string | null;
};
type AdminLoginChallengeRow = {
  token_hash: string;
  created_at: string;
  expires_at: string;
  otp_hash: string | null;
  otp_phone: string | null;
  otp_method: "phone" | "email" | null;
  otp_destination: string | null;
  otp_expires_at: string | null;
  failed_attempts: number;
};
type AdminOtpSendLimitRow = {
  bucket_key: string;
  window_started_at: string;
  request_count: number;
};

type SubscriptionPlanRow = {
  id: string;
  name: string;
  description: string;
  price_bdt: number;
  duration_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type MemberProfileRow = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  address: string | null;
  avatar_url: string | null;
  id_type: "NID" | "Student ID" | null;
  id_number: string | null;
  dob: string | null;
  institution_name: string | null;
  id_card_url: string | null;
  id_verification_submitted_at: string | null;
  is_id_verified: boolean;
  verification_status: "PENDING" | "APPROVED" | "REJECTED";
  rejection_reason: string | null;
  membership_status: "pending" | "active" | "rejected" | "suspended";
  membership_expires_at: string | null;
  current_plan_id: string | null;
  rental_subscription_start: string | null;
  rental_subscription_expires_at: string | null;
  referral_code: string;
  wallet_balance: number;
  created_at: string;
  updated_at: string;
};

type ReferralRow = {
  id: string;
  referrer_id: string;
  referee_id: string;
  status: "pending" | "completed";
  bonus_days_awarded: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReferralRewardRow = {
  id: string;
  referral_id: string;
  member_id: string;
  bonus_days_awarded: number;
  status: "locked" | "claimed";
  locked_at: string | null;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

type MembershipApplicationRow = {
  id: string;
  member_id: string;
  amount_bdt: number;
  payment_method: "bkash" | "nagad" | "WALLET";
  transaction_id: string;
  payment_screenshot_path: string | null;
  status: "pending" | "approved" | "rejected";
  terms_accepted_at: string | null;
  terms_version: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

type MemberSubscriptionRow = {
  id: string;
  member_id: string;
  plan_id: string;
  plan_name_snapshot: string;
  plan_price_snapshot: number;
  status: "pending" | "active" | "expired" | "cancelled";
  started_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

type PaymentSubmissionRow = {
  id: string;
  member_id: string;
  payment_type: "membership" | "rental" | "renewal" | "fine";
  related_membership_application_id: string | null;
  related_rental_request_id: string | null;
  related_fine_id: string | null;
  payment_method: "bkash" | "nagad" | "WALLET";
  amount_bdt: number;
  transaction_id: string;
  payer_phone: string | null;
  screenshot_path: string | null;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

type RentalRequestRow = {
  id: string;
  member_id: string;
  book_id: string;
  reservation_request_id: string | null;
  subscription_plan_id: string | null;
  rental_day_credit_id: string | null;
  amount_bdt: number;
  status: "pending" | "approved" | "rejected";
  terms_accepted_at: string | null;
  terms_version: string | null;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};

type RentalRow = {
  id: string;
  rental_request_id: string | null;
  member_id: string;
  book_id: string;
  subscription_plan_id: string | null;
  plan_name_snapshot: string | null;
  plan_price_snapshot: number | null;
  started_at: string | null;
  subscription_ends_at: string | null;
  returned_at: string | null;
  return_requested_at: string | null;
  status: "pending" | "active" | "overdue" | "return_requested" | "returned" | "cancelled";
  created_at: string;
  updated_at: string;
};

type RentalDayCreditRow = {
  id: string;
  member_id: string;
  source_rental_id: string;
  expires_at: string;
  status: "available" | "reserved" | "consumed" | "expired";
  consumed_by_rental_id: string | null;
  created_at: string;
  updated_at: string;
};

type ReservationRequestRow = {
  id: string;
  member_id: string;
  book_id: string;
  position: number;
  status: "waiting" | "notified" | "fulfilled" | "cancelled" | "expired";
  requested_at: string;
  notified_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

type FineLedgerRow = {
  id: string;
  member_id: string;
  rental_id: string | null;
  amount_bdt: number;
  fine_date: string;
  reason: string;
  status: "outstanding" | "paid" | "waived";
  paid_at: string | null;
  payment_submission_id: string | null;
  original_amount_bdt: number | null;
  review_note: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
};

type FineLedgerAdjustmentRow = {
  id: string;
  fine_id: string;
  admin_session_id: string;
  action: "override" | "waive";
  previous_amount_bdt: number;
  new_amount_bdt: number;
  previous_status: string;
  new_status: string;
  note: string;
  created_at: string;
};

type RentalReturnReceiptRow = {
  id: string;
  rental_id: string;
  member_id: string;
  admin_session_id: string;
  received_at: string;
  due_at: string;
  returned_early: boolean;
  carryover_days: number;
  created_at: string;
};

type FineAccrualControlRow = {
  singleton: boolean;
  accrual_start_date: string;
};

type FineAccrualCursorRow = {
  rental_id: string;
  next_fine_date: string;
  updated_at: string;
};

type FineAccrualSummary = {
  business_date: string;
  subscriptions_expired: number;
  rentals_marked_overdue: number;
  fine_entries_created: number;
  catch_up_rentals_pending: number;
};

type NotificationRow = {
  id: string;
  member_id: string;
  type: "membership_submitted" | "membership_approved" | "membership_rejected" | "rental_submitted" | "rental_approved" | "rental_rejected" | "book_issued" | "book_returned" | "rental_due" | "rental_overdue" | "subscription_activated" | "subscription_expiring" | "subscription_expired" | "reservation_available" | "fine_created" | "payment_approved" | "payment_rejected";
  title: string;
  message: string;
  channel: "in_app" | "sms";
  event_key: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  read_at: string | null;
  status: "pending" | "sent" | "read" | "failed";
  created_at: string;
  updated_at: string;
};

type FinanceTransactionRow = {
  id: string;
  entry_type: "income" | "expense";
  category: string;
  amount_bdt: number;
  transaction_date: string;
  description: string;
  payment_method: string | null;
  external_ref: string | null;
  created_by_admin_session_id: string | null;
  created_at: string;
  updated_at: string;
};

type LibrarySettingRow = {
  key: string;
  value_text: string | null;
  value_number: number | null;
  description: string | null;
  updated_at: string;
};

export type CareerQuestionType = "text" | "essay" | "multiple_choice";

export type JobRequiredFields = {
  require_resume: boolean;
  require_photo: boolean;
  require_skills: boolean;
  custom_questions: { id: string; label: string; required: boolean; type: CareerQuestionType; options: string[] }[];
};

type JobRow = {
  id: string;
  title: string;
  department: string;
  description: string;
  image_url: string | null;
  required_fields: JobRequiredFields;
  status: "ACTIVE" | "CLOSED";
  created_at: string;
  updated_at: string;
};

type JobApplicationRow = {
  id: string;
  job_id: string;
  user_id: string;
  applicant_name: string;
  applicant_email: string;
  resume_url: string | null;
  photo_url: string | null;
  skills: string[];
  custom_answers: Record<string, string>;
  review_note: string | null;
  status: "PENDING" | "SHORTLISTED" | "REJECTED";
  created_at: string;
  updated_at: string;
};

type MemberReminderSummary = {
  business_date: string;
  subscription_expiring_3d: number;
  subscription_expiring_1d: number;
  subscriptions_expired: number;
  rentals_due: number;
  rentals_overdue: number;
};

export type Database = {
  public: {
    Tables: {
      books: {
        Row: BookRow;
        Insert: BookInsert;
        Update: Partial<BookInsert>;
        Relationships: [{
          foreignKeyName: "books_category_id_fkey";
          columns: ["category_id"];
          isOneToOne: false;
          referencedRelation: "categories";
          referencedColumns: ["id"];
        }];
      };
      categories: {
        Row: CategoryRow;
        Insert: CategoryInsert;
        Update: Partial<CategoryInsert>;
        Relationships: [];
      };
      admin_sessions: {
        Row: AdminSessionRow;
        Insert: Omit<AdminSessionRow, "id" | "created_at"> & Partial<Pick<AdminSessionRow, "id" | "created_at">>;
        Update: Partial<AdminSessionRow>;
        Relationships: [];
      };
      admin_login_attempts: {
        Row: AdminLoginAttemptRow;
        Insert: AdminLoginAttemptRow;
        Update: Partial<AdminLoginAttemptRow>;
        Relationships: [];
      };
      admin_login_challenges: {
        Row: AdminLoginChallengeRow;
        Insert: Omit<AdminLoginChallengeRow, "created_at" | "otp_hash" | "otp_phone" | "otp_method" | "otp_destination" | "otp_expires_at" | "failed_attempts"> & Partial<Pick<AdminLoginChallengeRow, "created_at" | "otp_hash" | "otp_phone" | "otp_method" | "otp_destination" | "otp_expires_at" | "failed_attempts">>;
        Update: Partial<AdminLoginChallengeRow>;
        Relationships: [];
      };
      admin_otp_send_limits: {
        Row: AdminOtpSendLimitRow;
        Insert: AdminOtpSendLimitRow;
        Update: Partial<AdminOtpSendLimitRow>;
        Relationships: [];
      };
      subscription_plans: {
        Row: SubscriptionPlanRow;
        Insert: Partial<SubscriptionPlanRow>;
        Update: Partial<SubscriptionPlanRow>;
        Relationships: [];
      };
      member_profiles: {
        Row: MemberProfileRow;
        Insert: Partial<MemberProfileRow>;
        Update: Partial<MemberProfileRow>;
        Relationships: [];
      };
      referrals: {
        Row: ReferralRow;
        Insert: Partial<ReferralRow>;
        Update: Partial<ReferralRow>;
        Relationships: [{
          foreignKeyName: "referrals_referee_id_fkey";
          columns: ["referee_id"];
          isOneToOne: false;
          referencedRelation: "member_profiles";
          referencedColumns: ["id"];
        }, {
          foreignKeyName: "referrals_referrer_id_fkey";
          columns: ["referrer_id"];
          isOneToOne: false;
          referencedRelation: "member_profiles";
          referencedColumns: ["id"];
        }];
      };
      referral_rewards: {
        Row: ReferralRewardRow;
        Insert: Partial<ReferralRewardRow>;
        Update: Partial<ReferralRewardRow>;
        Relationships: [
          {
            foreignKeyName: "referral_rewards_referral_id_fkey";
            columns: ["referral_id"];
            isOneToOne: false;
            referencedRelation: "referrals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "referral_rewards_member_id_fkey";
            columns: ["member_id"];
            isOneToOne: false;
            referencedRelation: "member_profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      jobs: {
        Row: JobRow;
        Insert: Partial<JobRow>;
        Update: Partial<JobRow>;
        Relationships: [];
      };
      job_applications: {
        Row: JobApplicationRow;
        Insert: Partial<JobApplicationRow>;
        Update: Partial<JobApplicationRow>;
        Relationships: [{
          foreignKeyName: "job_applications_job_id_fkey";
          columns: ["job_id"];
          isOneToOne: false;
          referencedRelation: "jobs";
          referencedColumns: ["id"];
        }];
      };
      membership_applications: {
        Row: MembershipApplicationRow;
        Insert: Partial<MembershipApplicationRow>;
        Update: Partial<MembershipApplicationRow>;
        Relationships: [];
      };
      member_subscriptions: {
        Row: MemberSubscriptionRow;
        Insert: Partial<MemberSubscriptionRow>;
        Update: Partial<MemberSubscriptionRow>;
        Relationships: [];
      };
      payment_submissions: {
        Row: PaymentSubmissionRow;
        Insert: Partial<PaymentSubmissionRow>;
        Update: Partial<PaymentSubmissionRow>;
        Relationships: [];
      };
      rental_requests: {
        Row: RentalRequestRow;
        Insert: Partial<RentalRequestRow>;
        Update: Partial<RentalRequestRow>;
        Relationships: [];
      };
      rentals: {
        Row: RentalRow;
        Insert: Partial<RentalRow>;
        Update: Partial<RentalRow>;
        Relationships: [];
      };
      rental_day_credits: {
        Row: RentalDayCreditRow;
        Insert: Partial<RentalDayCreditRow>;
        Update: Partial<RentalDayCreditRow>;
        Relationships: [];
      };
      reservation_requests: {
        Row: ReservationRequestRow;
        Insert: Partial<ReservationRequestRow>;
        Update: Partial<ReservationRequestRow>;
        Relationships: [];
      };
      fine_ledger: {
        Row: FineLedgerRow;
        Insert: Partial<FineLedgerRow>;
        Update: Partial<FineLedgerRow>;
        Relationships: [];
      };
      fine_ledger_adjustments: {
        Row: FineLedgerAdjustmentRow;
        Insert: Partial<FineLedgerAdjustmentRow>;
        Update: Partial<FineLedgerAdjustmentRow>;
        Relationships: [];
      };
      rental_return_receipts: {
        Row: RentalReturnReceiptRow;
        Insert: Partial<RentalReturnReceiptRow>;
        Update: Partial<RentalReturnReceiptRow>;
        Relationships: [];
      };
      fine_accrual_control: {
        Row: FineAccrualControlRow;
        Insert: Partial<FineAccrualControlRow>;
        Update: Partial<FineAccrualControlRow>;
        Relationships: [];
      };
      fine_accrual_cursors: {
        Row: FineAccrualCursorRow;
        Insert: Partial<FineAccrualCursorRow>;
        Update: Partial<FineAccrualCursorRow>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRow;
        Insert: Partial<NotificationRow>;
        Update: Partial<NotificationRow>;
        Relationships: [];
      };
      finance_transactions: {
        Row: FinanceTransactionRow;
        Insert: Partial<FinanceTransactionRow>;
        Update: Partial<FinanceTransactionRow>;
        Relationships: [];
      };
      library_settings: {
        Row: LibrarySettingRow;
        Insert: Partial<LibrarySettingRow>;
        Update: Partial<LibrarySettingRow>;
        Relationships: [];
      };
      otp_rate_limits: {
        Row: { ip_address: string; request_count: number; address_changes: number; locked_until: string | null; };
        Insert: Partial<{ ip_address: string; request_count: number; address_changes: number; locked_until: string | null; }>;
        Update: Partial<{ ip_address: string; request_count: number; address_changes: number; locked_until: string | null; }>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      link_member_referral: { Args: { p_member_id: string; p_referral_code: string }; Returns: boolean };
      is_admin_login_limited: { Args: { p_identifier_hash: string }; Returns: boolean };
      record_admin_login_failure: { Args: { p_identifier_hash: string }; Returns: boolean };
      consume_admin_otp_send_limit: { Args: { p_ip_hash: string; p_challenge_hash: string }; Returns: boolean };
      consume_admin_login_rate_limit: { Args: { p_ip_hash: string }; Returns: boolean };
      consume_member_otp_ip_attempt: { Args: { p_ip_address: string }; Returns: boolean };
      consume_member_auth_rate_limit: { Args: { p_ip_hash: string; p_identifier_hash: string; p_operation: string }; Returns: boolean };
      consume_admin_login_otp: { Args: { p_token_hash: string; p_otp_hash: string }; Returns: string };
      approve_rental_request: {
        Args: { p_request_id: string; p_reviewer_session_id: string; p_admin_note: string | null };
        Returns: string;
      };
      handover_rental: {
        Args: { p_rental_id: string; p_reviewer_session_id: string };
        Returns: string;
      };
      receive_rental: {
        Args: { p_rental_id: string; p_reviewer_session_id: string };
        Returns: string;
      };
      admin_approve_pending_member: {
        Args: { p_member_id: string; p_plan_id: string; p_reviewer_session_id: string };
        Returns: string;
      };
      admin_assign_member_rental_plan: {
        Args: { p_member_id: string; p_plan_id: string; p_reviewer_session_id: string };
        Returns: string;
      };
      admin_extend_member_membership: {
        Args: { p_member_id: string; p_months: number; p_reviewer_session_id: string };
        Returns: string;
      };
      admin_extend_rental_period: {
        Args: { p_rental_id: string; p_days: number; p_reviewer_session_id: string };
        Returns: string;
      };
      request_rental_return: {
        Args: {
          p_rental_id: string;
          p_review_text: string;
          p_reading_experience_rating: number;
          p_service_experience_rating: number;
          p_book_quality_rating: number;
          p_book_details_rating: number;
          p_payment_method?: string | null;
          p_transaction_id?: string | null;
        };
        Returns: string;
      };
      get_public_book_reviews: {
        Args: { p_book_id: string };
        Returns: {
          review_id: string;
          reviewer_label: string;
          review_text: string;
          reading_experience_rating: number;
          service_experience_rating: number;
          book_quality_rating: number;
          book_details_rating: number;
          overall_rating: number;
          created_at: string;
        }[];
      };
      get_public_book_rating_summary: {
        Args: { p_book_id: string };
        Returns: {
          reading_experience_rating: number | null;
          service_experience_rating: number | null;
          book_quality_rating: number | null;
          book_details_rating: number | null;
          review_count: number;
        }[];
      };
      get_library_service_rating: {
        Args: Record<never, never>;
        Returns: { average_rating: number | null; review_count: number }[];
      };
      submit_subscription_renewal: {
        Args: { p_payment_method: string; p_transaction_id: string };
        Returns: string;
      };
      review_member_payment_submission: {
        Args: { p_payment_id: string; p_reviewer_session_id: string; p_approve: boolean; p_admin_note?: string | null };
        Returns: string;
      };
      admin_review_fine: {
        Args: { p_fine_id: string; p_admin_session_id: string; p_action: string; p_amount_bdt?: number | null; p_note?: string | null };
        Returns: string;
      };
      admin_send_fine_reminder: {
        Args: { p_fine_id: string; p_admin_session_id: string };
        Returns: boolean;
      };
      reject_rental_request: {
        Args: { p_request_id: string; p_reviewer_session_id: string; p_admin_note: string | null };
        Returns: string;
      };
      review_membership_application: {
        Args: { p_application_id: string; p_plan_id: string | null; p_reviewer_session_id: string; p_approve: boolean; p_admin_note: string | null };
        Returns: string;
      };
      submit_membership_application: {
        Args: { p_member_id: string; p_payment_method: string; p_transaction_id: string; p_payer_phone: string; p_screenshot_path: string | null; p_terms_version: string };
        Returns: string;
      };
      submit_first_rental_request: {
        Args: { p_member_id: string; p_book_id: string; p_reservation_request_id: string | null; p_plan_id: string; p_amount_bdt: number; p_payment_method: string; p_transaction_id: string; p_payer_phone: string; p_screenshot_path: string | null; p_terms_version: string };
        Returns: string;
      };
      apply_membership_with_wallet: {
        Args: { p_member_id: string; p_user_id: string; p_plan_id: string | null; p_terms_version: string };
        Returns: string;
      };
      submit_first_rental_request_with_wallet: {
        Args: { p_member_id: string; p_user_id: string; p_book_id: string; p_plan_id: string; p_reservation_request_id: string | null; p_terms_version: string };
        Returns: string;
      };
      archive_admin_book: {
        Args: { p_book_id: string; p_reviewer_session_id: string };
        Returns: string;
      };
      create_book_reservation: { Args: { p_book_id: string }; Returns: string };
      cancel_book_reservation: { Args: { p_reservation_id: string }; Returns: string };
      get_my_book_reservations: {
        Args: Record<never, never>;
        Returns: { reservation_id: string; book_id: string; book_title: string; status: string; requested_at: string; queue_position: number | null }[];
      };
      get_next_book_reservation: {
        Args: { p_book_id: string };
        Returns: { reservation_id: string; book_id: string; book_title: string; member_id: string; member_name: string; member_phone: string; requested_at: string; queue_position: number }[];
      };
      accrue_overdue_fines: {
        Args: Record<never, never>;
        Returns: FineAccrualSummary;
      };
      process_member_reminders: {
        Args: Record<never, never>;
        Returns: MemberReminderSummary;
      };
      mark_member_notification_read: {
        Args: { p_notification_id: string };
        Returns: boolean;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
