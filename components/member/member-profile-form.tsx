"use client";

import { useOptimistic, useState, useTransition } from "react";
import { ButtonLabel } from "@/components/button-label";
import Link from "next/link";
import { createMemberProfileAction, type MemberProfileFormState } from "@/app/member/register/actions";

type MemberProfileFormProps = {
  phone: string;
  phoneAuthRequired: boolean;
  fullName?: string;
  email?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
  identityVerified?: boolean;
  identityLocked?: boolean;
  nextDestination?: string;
};

const initialState: MemberProfileFormState = {};

export function MemberProfileForm({ phone, phoneAuthRequired, fullName = "", email = "", address = "", avatarUrl = "", identityVerified = false, identityLocked = identityVerified, nextDestination }: MemberProfileFormProps) {
  const [state, setState] = useState(initialState);
  const [optimisticSaving, setOptimisticSaving] = useOptimistic(false);
  const [isPending, startTransition] = useTransition();

  function submitProfile(formData: FormData) {
    setState({});
    startTransition(async () => {
      setOptimisticSaving(true);
      try {
        setState(await createMemberProfileAction(state, formData));
      } catch {
        setState({ error: "Your profile could not be saved. Refresh and try again." });
      }
    });
  }

  return (
    <form action={submitProfile} className="member-form">
      <input name="next" type="hidden" value={nextDestination ?? ""} />
      <label htmlFor="member-full-name">Full name</label>
      <input autoComplete="name" id="member-full-name" maxLength={120} minLength={2} name="fullName" readOnly={identityLocked} required defaultValue={fullName} />
      {identityLocked ? <p className="member-field-note">{identityVerified ? "Your name is locked because your ID verification is approved. Contact the library if it needs correction." : "Your name and address are locked while your ID verification is under review."}</p> : null}

      <label htmlFor="member-phone">{phoneAuthRequired ? "Verified phone number" : "Phone number"}</label>
      <input
        autoComplete="tel"
        defaultValue={phone}
        id="member-phone"
        inputMode="tel"
        maxLength={24}
        name="phone"
        placeholder="01XXXXXXXXX"
        readOnly={phoneAuthRequired}
        required
      />
      <p className="member-field-note">{phoneAuthRequired ? "Your phone was verified when you signed in." : "Enter a Bangladesh mobile number for your member profile. A code is sent by SMS only when you choose phone sign-in."}</p>

      <label htmlFor="member-email">Email <span>(optional)</span></label>
      <input
        autoComplete="email"
        defaultValue={email ?? ""}
        id="member-email"
        maxLength={254}
        name="email"
        type="email"
      />
      <p className="member-field-note">Only the identifier you use to sign in is verified by its OTP. This email is optional profile contact information.</p>

      <label htmlFor="member-avatar-url">Avatar URL <span>(optional)</span></label>
      <input autoComplete="url" id="member-avatar-url" maxLength={2048} name="avatarUrl" type="url" defaultValue={avatarUrl ?? ""} />

      <label htmlFor="member-address">Address <span>(optional)</span></label>
      <textarea autoComplete="street-address" id="member-address" maxLength={500} name="address" readOnly={identityLocked} rows={4} defaultValue={address ?? ""} />

      {state.error ? <p className="member-form-message member-form-message-error" role="alert">{state.error}</p> : null}
      {state.success ? (
        <div className="member-form-message member-form-message-success" role="status">
          <p>{state.success}</p>
          <Link className="text-link" href={state.nextDestination ?? nextDestination ?? "/member/dashboard"}>Continue <span aria-hidden="true">→</span></Link>
        </div>
      ) : null}

      {optimisticSaving || isPending ? <p className="member-field-note" role="status">Saving profile…</p> : null}
      <button aria-busy={isPending} className="button-primary button-stateful" disabled={isPending} type="submit">
        <ButtonLabel pending={isPending} pendingLabel="Saving profile…">Save profile</ButtonLabel>
      </button>
    </form>
  );
}