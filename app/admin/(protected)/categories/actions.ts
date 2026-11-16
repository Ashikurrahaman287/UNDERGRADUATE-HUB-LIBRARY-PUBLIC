"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin/session";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { validateActionFormData } from "@/lib/security/guards";

export type CategoryActionState = {
  error?: string;
  success?: string;
};

function text(formData: FormData, key: string): string {
  return typeof formData.get(key) === "string" ? String(formData.get(key)).trim() : "";
}

function categorySlug(name: string): string {
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function validId(value: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

function validateCategory(name: string, description: string): string | null {
  if (name.length < 2 || name.length > 80) return "Category name must be between 2 and 80 characters.";
  if (description.length > 500) return "Category description must be 500 characters or fewer.";
  if (!categorySlug(name)) return "Use a category name containing letters or numbers.";
  return null;
}

function refreshCatalogue(): void {
  revalidatePath("/");
  revalidatePath("/books");
  revalidatePath("/categories");
  revalidatePath("/admin");
  revalidatePath("/admin/categories");
  revalidatePath("/admin/books");
}

export async function createCategoryAction(_previousState: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  validateActionFormData(formData);
  await requireAdminSession();
  const name = text(formData, "name");
  const description = text(formData, "description");
  const validationError = validateCategory(name, description);
  if (validationError) return { error: validationError };

  const { error } = await createAdminSupabaseClient().from("categories").insert({
    name,
    slug: categorySlug(name),
    description,
    is_active: true,
  });
  if (error?.code === "23505") return { error: "A category with this name or URL already exists." };
  if (error) return { error: "The category could not be created. Check the details and try again." };

  refreshCatalogue();
  return { success: "Category created." };
}

export async function updateCategoryAction(_previousState: CategoryActionState, formData: FormData): Promise<CategoryActionState> {
  validateActionFormData(formData);
  await requireAdminSession();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const description = text(formData, "description");
  if (!validId(id)) return { error: "Category not found." };
  const validationError = validateCategory(name, description);
  if (validationError) return { error: validationError };

  const { data, error } = await createAdminSupabaseClient().from("categories")
    .update({ name, description })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error?.code === "23505") return { error: "A category with this name already exists." };
  if (error || !data) return { error: "The category could not be updated. Refresh and try again." };

  refreshCatalogue();
  return { success: "Category changes saved." };
}

export async function setCategoryArchivedAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  await requireAdminSession();
  const id = text(formData, "id");
  if (!validId(id)) throw new Error("Category not found.");

  const { data, error } = await createAdminSupabaseClient().from("categories").update({ is_active: false }).eq("id", id).select("id").maybeSingle();
  if (error || !data) throw new Error("The category could not be archived. Refresh and try again.");
  refreshCatalogue();
}

export type CategoryFormState = CategoryActionState & {
  fieldErrors?: { name?: string; description?: string };
};

export async function saveCategoryAction(previousState: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  validateActionFormData(formData);
  return text(formData, "id")
    ? updateCategoryAction(previousState, formData)
    : createCategoryAction(previousState, formData);
}