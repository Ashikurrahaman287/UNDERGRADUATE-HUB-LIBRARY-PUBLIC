"use client";

import { useActionState } from "react";
import { ButtonLabel } from "@/components/button-label";
import { saveCategoryAction, type CategoryFormState } from "@/app/admin/(protected)/categories/actions";

const initialState: CategoryFormState = {};

type CategoryFormProps = {
  categoryId?: string;
  name?: string;
  description?: string;
};

export function CategoryForm({ categoryId, name = "", description = "" }: CategoryFormProps) {
  const [state, formAction, pending] = useActionState(saveCategoryAction, initialState);
  return (
    <form action={formAction} className="admin-category-form">
      {categoryId ? <input name="id" type="hidden" value={categoryId} /> : null}
      <label>Name<input defaultValue={name} maxLength={80} name="name" required /></label>
      {state.fieldErrors?.name ? <small className="admin-form-error" role="alert">{state.fieldErrors.name}</small> : null}
      <label>Description<textarea defaultValue={description} maxLength={400} name="description" rows={2} /></label>
      {state.fieldErrors?.description ? <small className="admin-form-error" role="alert">{state.fieldErrors.description}</small> : null}
      {state.error ? <small className="admin-form-error" role="alert">{state.error}</small> : null}
      {state.success ? <small className="admin-form-success" role="status">{state.success}</small> : null}
      <button aria-busy={pending} className="button-outline button-stateful" disabled={pending} type="submit"><ButtonLabel pending={pending} pendingLabel="Saving…">{categoryId ? "Save category" : "Add category"}</ButtonLabel></button>
    </form>
  );
}
