"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminSessionId } from "@/lib/admin/session";
import { validateActionFormData } from "@/lib/security/guards";
import { hasSupportedImageSignature, supportedImageExtension } from "@/lib/security/image-validation";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import type { JobRequiredFields } from "@/lib/database.types";

export type JobStatus = "ACTIVE" | "CLOSED";
export type ApplicationStatus = "PENDING" | "SHORTLISTED" | "REJECTED";
export type CareerStatusActionState = { error?: string; success?: string };

export type CareerJobActionState = { error?: string; success?: string };

function value(formData: FormData, key: string): string {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry.trim() : "";
}

function validId(id: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id);
}

function validImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function parseQuestions(raw: string): JobRequiredFields["custom_questions"] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const labels = raw.split(/\r?\n/).map((label) => label.trim()).filter(Boolean);
    if (labels.length > 10 || labels.some((label) => label.length < 2 || label.length > 200)) return null;
    return labels.map((label, index) => ({ id: `question_${index + 1}`, label, required: true, type: "text" as const, options: [] }));
  }

  if (!Array.isArray(parsed) || parsed.length > 10) return null;
  const ids = new Set<string>();
  const questions: JobRequiredFields["custom_questions"] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const question = item as Record<string, unknown>;
    const id = typeof question.id === "string" ? question.id : "";
    const label = typeof question.label === "string" ? question.label.trim() : "";
    const type = question.type;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || ids.has(id) || label.length < 2 || label.length > 200) return null;
    if (type !== "text" && type !== "essay" && type !== "multiple_choice") return null;
    const options = Array.isArray(question.options) && question.options.every((option) => typeof option === "string")
      ? question.options.map((option) => (option as string).trim()).filter(Boolean)
      : [];
    if (type === "multiple_choice" && (options.length < 2 || options.length > 10 || options.some((option) => option.length > 120) || new Set(options).size !== options.length)) return null;
    ids.add(id);
    questions.push({ id, label, required: question.required !== false, type, options: type === "multiple_choice" ? options : [] });
  }
  return questions;
}

async function uploadCareerBanner(file: File): Promise<{ path: string; url: string }> {
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error("Choose an image smaller than 5 MB.");
  if (file.type !== "image/jpeg" && file.type !== "image/png") throw new Error("Upload a JPG or PNG banner.");
  const extension = supportedImageExtension(file.type);
  if (!extension) throw new Error("Upload a JPG or PNG banner.");
  if (!hasSupportedImageSignature(new Uint8Array(await file.arrayBuffer()), file.type)) throw new Error("The banner is not a valid image.");

  const path = `careers/${randomUUID()}.${extension}`;
  const client = createAdminSupabaseClient();
  const { error } = await client.storage.from("career-banners").upload(path, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (error) throw new Error("The job banner could not be uploaded.");
  return { path, url: client.storage.from("career-banners").getPublicUrl(path).data.publicUrl };
}

export async function createCareerJobAction(_previousState: CareerJobActionState, formData: FormData): Promise<CareerJobActionState> {
  validateActionFormData(formData);
  await requireAdminSessionId();
  const title = value(formData, "title");
  const department = value(formData, "department");
  const description = value(formData, "description");
  const customQuestions = parseQuestions(value(formData, "customQuestions"));
  const bannerSource = value(formData, "bannerSource");
  const imageUrl = value(formData, "imageUrl");
  const banner = formData.get("image");
  const image = bannerSource === "upload" && banner instanceof File && banner.size > 0 ? banner : null;

  if (title.length < 2 || title.length > 160) return { error: "Enter a job title between 2 and 160 characters." };
  if (department.length < 2 || department.length > 120) return { error: "Enter a department between 2 and 120 characters." };
  if (!description || description.length > 12000) return { error: "Enter a job description up to 12,000 characters." };
  if (!customQuestions) return { error: "Add at most 10 custom questions, each between 2 and 200 characters." };
  if (bannerSource !== "upload" && bannerSource !== "url") return { error: "Choose a valid banner source." };
  if (bannerSource === "url" && imageUrl && !validImageUrl(imageUrl)) return { error: "Enter an absolute HTTPS image URL." };

  let uploaded: { path: string; url: string } | null = null;
  if (image) {
    try {
      uploaded = await uploadCareerBanner(image);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "The job banner could not be uploaded." };
    }
  }

  const client = createAdminSupabaseClient();
  const requiredFields: JobRequiredFields = {
    require_resume: formData.get("requireResume") === "on",
    require_photo: formData.get("requirePhoto") === "on",
    require_skills: formData.get("requireSkills") === "on",
    custom_questions: customQuestions,
  };
  const { error } = await client.from("jobs").insert({
    title,
    department,
    description,
    image_url: bannerSource === "url" ? imageUrl || null : uploaded?.url ?? null,
    required_fields: requiredFields,
    status: "ACTIVE",
  });
  if (error) {
    if (uploaded) await client.storage.from("career-banners").remove([uploaded.path]);
    return { error: error.code === "23514" ? "The job details are invalid." : "The job posting could not be created." };
  }

  revalidatePath("/careers");
  revalidatePath("/ashik-loves-jannat/careers");
  return { success: "Job posting created." };
}

export async function updateCareerJobAction(_previousState: CareerJobActionState, formData: FormData): Promise<CareerJobActionState> {
  validateActionFormData(formData);
  await requireAdminSessionId();
  const jobId = value(formData, "jobId");
  const title = value(formData, "title");
  const department = value(formData, "department");
  const description = value(formData, "description");
  const customQuestions = parseQuestions(value(formData, "customQuestions"));
  const bannerSource = value(formData, "bannerSource");
  const imageUrl = value(formData, "imageUrl") || value(formData, "existingImageUrl");
  const banner = formData.get("image");
  const image = bannerSource === "upload" && banner instanceof File && banner.size > 0 ? banner : null;

  if (!validId(jobId)) return { error: "This job posting could not be found." };
  if (title.length < 2 || title.length > 160) return { error: "Enter a job title between 2 and 160 characters." };
  if (department.length < 2 || department.length > 120) return { error: "Enter a department between 2 and 120 characters." };
  if (!description || description.length > 12000) return { error: "Enter a job description up to 12,000 characters." };
  if (!customQuestions) return { error: "Review the custom questions and their answer options." };
  if (bannerSource !== "upload" && bannerSource !== "url") return { error: "Choose a valid banner source." };
  if (bannerSource === "url" && imageUrl && !validImageUrl(imageUrl)) return { error: "Enter an absolute HTTPS image URL." };

  const client = createAdminSupabaseClient();
  const { data: existingJob, error: existingJobError } = await client.from("jobs").select("image_url").eq("id", jobId).maybeSingle();
  if (existingJobError || !existingJob) return { error: "This job posting could not be loaded for editing." };

  let uploaded: { path: string; url: string } | null = null;
  if (image) {
    try {
      uploaded = await uploadCareerBanner(image);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "The job banner could not be uploaded." };
    }
  }

  const { error } = await client.from("jobs").update({
    title,
    department,
    description,
    image_url: bannerSource === "url" ? imageUrl || existingJob.image_url : uploaded?.url ?? existingJob.image_url,
    required_fields: {
      require_resume: formData.get("requireResume") === "on",
      require_photo: formData.get("requirePhoto") === "on",
      require_skills: formData.get("requireSkills") === "on",
      custom_questions: customQuestions,
    },
  }).eq("id", jobId);
  if (error) {
    if (uploaded) await client.storage.from("career-banners").remove([uploaded.path]);
    return { error: "The job posting could not be updated." };
  }

  revalidatePath("/careers");
  revalidatePath(`/careers/${jobId}`);
  revalidatePath("/ashik-loves-jannat/careers");
  return { success: "Job posting updated." };
}

export async function updateCareerJobStatusAction(jobId: string, status: JobStatus): Promise<CareerStatusActionState> {
  await requireAdminSessionId();
  if (!validId(jobId) || (status !== "ACTIVE" && status !== "CLOSED")) return { error: "Choose a valid job status." };

  const { error } = await createAdminSupabaseClient().from("jobs").update({ status }).eq("id", jobId);
  if (error) return { error: "The job status could not be updated. Refresh and try again." };
  revalidatePath("/careers");
  revalidatePath(`/careers/${jobId}`);
  revalidatePath("/ashik-loves-jannat/careers");
  return { success: "Job status updated." };
}

export async function updateCareerApplicationStatusAction(applicationId: string, jobId: string, status: ApplicationStatus): Promise<CareerStatusActionState> {
  await requireAdminSessionId();
  if (!validId(applicationId) || !validId(jobId) || (status !== "PENDING" && status !== "SHORTLISTED" && status !== "REJECTED")) {
    return { error: "Choose a valid application status." };
  }

  const { error } = await createAdminSupabaseClient().from("job_applications")
    .update({ status })
    .eq("id", applicationId)
    .eq("job_id", jobId);
  if (error) return { error: "The application status could not be updated. Refresh and try again." };
  revalidatePath(`/ashik-loves-jannat/careers/${jobId}`);
  revalidatePath(`/careers/${jobId}`);
  revalidatePath("/careers/my-applications");
  return { success: "Application status updated." };
}

export async function updateCareerApplicationReviewNoteAction(formData: FormData): Promise<void> {
  validateActionFormData(formData);
  await requireAdminSessionId();
  const applicationId = value(formData, "applicationId");
  const jobId = value(formData, "jobId");
  const reviewNote = value(formData, "reviewNote");
  if (!validId(applicationId) || !validId(jobId) || reviewNote.length > 2000) {
    redirect(`/ashik-loves-jannat/careers/${encodeURIComponent(jobId)}?review=note-error`);
  }

  const { error } = await createAdminSupabaseClient().from("job_applications")
    .update({ review_note: reviewNote || null })
    .eq("id", applicationId)
    .eq("job_id", jobId);
  if (error) redirect(`/ashik-loves-jannat/careers/${jobId}?review=note-error`);
  revalidatePath(`/careers/${jobId}`);
  revalidatePath("/careers/my-applications");
  redirect(`/ashik-loves-jannat/careers/${jobId}?review=note-updated`);
}