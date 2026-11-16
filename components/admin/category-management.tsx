"use client";

import { useActionState } from "react";
import { ButtonLabel } from "@/components/button-label";
import { AdminSubmitButton } from "@/components/admin/admin-submit-button";
import { createCategoryAction, setCategoryArchivedAction, updateCategoryAction, type CategoryActionState } from "@/app/admin/(protected)/categories/actions";
import type { Category } from "@/data/categories";

const initialState: CategoryActionState = {};

function CreateCategoryForm() {
  const [state, formAction, pending] = useActionState(createCategoryAction, initialState);
  return (
    <form action={formAction} className="admin-category-form">
      <h2 className="display-font">Add category</h2>
      <label className="admin-form-field">Name<input maxLength={80} minLength={2} name="name" required /></label>
      <label className="admin-form-field">Description<textarea maxLength={500} name="description" rows={3} /></label>
      {state.error ? <p className="admin-form-error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="admin-form-success" role="status">{state.success}</p> : null}
      <button aria-busy={pending} className="button-primary button-stateful" disabled={pending} type="submit"><ButtonLabel pending={pending} pendingLabel="Creating…">Create category</ButtonLabel></button>
    </form>
  );
}

function CategoryEditor({ category }: { category: Category }) {
  const [state, formAction, pending] = useActionState(updateCategoryAction, initialState);
  return (
    <form action={formAction} className="admin-category-edit-form">
      <input name="id" type="hidden" value={category.id ?? ""} />
      <label className="admin-form-field">Name<input defaultValue={category.name} maxLength={80} minLength={2} name="name" required /></label>
      <label className="admin-form-field">Description<textarea defaultValue={category.description} maxLength={500} name="description" rows={2} /></label>
      {state.error ? <p className="admin-form-error" role="alert">{state.error}</p> : null}
      {state.success ? <p className="admin-form-success" role="status">{state.success}</p> : null}
      <button aria-busy={pending} className="admin-action-button button-stateful" disabled={pending} type="submit"><ButtonLabel pending={pending} pendingLabel="Saving…">Save</ButtonLabel></button>
    </form>
  );
}

export function CategoryManagement({ categories, bookCounts }: { categories: Category[]; bookCounts: Record<string, number> }) {
  return (
    <div className="admin-category-management">
      <CreateCategoryForm />
      <section className="admin-category-list" aria-label="Library categories">
        {categories.map((category) => <article className="admin-category-row" key={category.id ?? category.slug}>
          <div className="admin-category-summary"><h2>{category.name}</h2><p>{category.description}</p><span>{bookCounts[category.name] ?? 0} books</span></div>
          <CategoryEditor category={category} />
          {category.isActive !== false ? <form action={setCategoryArchivedAction}><input name="id" type="hidden" value={category.id ?? ""} /><AdminSubmitButton className="admin-action-button admin-archive-button" confirmMessage={`Archive “${category.name}”? Books and history will be preserved.`} pendingLabel="Archiving…">Archive</AdminSubmitButton></form> : <span className="admin-archived-label">Archived</span>}
        </article>)}
      </section>
    </div>
  );
}