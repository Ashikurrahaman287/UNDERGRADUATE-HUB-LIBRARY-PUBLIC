"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireMemberSession } from "@/lib/member/session";
import { parseJobRequiredFields } from "@/lib/careers";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { validateActionFormData } from "@/lib/security/guards";

export type CareerApplicationState = { error?: string; success?: string };

type CareerStorageClient = {
  storage: {
    from(bucket: "career-submissions"): {
      upload(path: string, file: File, options: { upsert: false; contentType: string; cacheControl: string }): PromiseLike<{ error: { message: string } | null }>;
      remove(paths: string[]): PromiseLike<unknown>;
    };
  };
};

const maximumResumeBytes = 5 * 1024 * 1024;
const maximumPhotoBytes = 5 * 1024 * 1024;

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function uploadResume(file: File, userId: string, jobId: string, client: CareerStorageClient): Promise<string> {
  if (!file.size || file.size > maximumResumeBytes) throw new Error("Resume must be smaller than 5 MB.");
  if (file.type !== "application/pdf") throw new Error("Upload a PDF resume.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-") {
    throw new Error("The resume file does not match its declared format.");
  }

  const path = `${userId}/${jobId}/${randomUUID()}.pdf`;
  const { error } = await client.storage.from("career-submissions").upload(path, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: "0",
  });
  if (error) throw new Error("Your resume could not be uploaded. Try again.");
  return path;
}

async function uploadPhoto(file: File, userId: string, jobId: string, client: CareerStorageClient): Promise<string> {
  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : null;
  if (!file.size || file.size > maximumPhotoBytes) throw new Error("Applicant photo must be smaller than 5 MB.");
  if (!extension) throw new Error("Upload a JPG or PNG applicant photo.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validImage = file.type === "image/jpeg"
    ? bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.type === "image/png"
      ? bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
      : false;
  if (!validImage) throw new Error("The photo file does not match its declared format.");

  const path = `${userId}/${jobId}/${randomUUID()}.${extension}`;
  const { error } = await client.storage.from("career-submissions").upload(path, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: "0",
  });
  if (error) throw new Error("Your photo could not be uploaded. Try again.");
  return path;
}

async function removeCareerUploads(client: CareerStorageClient, paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    await client.storage.from("career-submissions").remove(paths);
  } catch (error) {
    console.error("Job Application Upload Cleanup Error:", error);
  }
}

export async function submitCareerApplicationAction(_previousState: CareerApplicationState, formData: FormData): Promise<CareerApplicationState> {
  validateActionFormData(formData);
  const uploadedPaths: string[] = [];
  let storageClient: CareerStorageClient | null = null;
  try {
    const session = await requireMemberSession();
    const jobId = (formData.get("jobId") ?? "").toString();
    if (!validUuid(jobId)) return { error: "This job posting could not be found." };

    const client = session.supabase;
    const uploads = createAdminSupabaseClient() as unknown as CareerStorageClient;
    storageClient = uploads;
    const { data: job, error: jobError } = await client.from("jobs")
      .select("id, required_fields")
      .eq("id", jobId)
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (jobError) {
      console.error("Job Application Submission Error:", jobError);
      return { error: "This job is temporarily unavailable. Try again." };
    }
    if (!job) return { error: "This job is no longer accepting applications." };
    const requiredFields = parseJobRequiredFields(job.required_fields);

    const applicantName = (formData.get("applicantName") ?? "").toString().trim();
    const applicantEmail = (formData.get("applicantEmail") ?? "").toString().trim().toLowerCase();
    if (applicantName.length < 2 || applicantName.length > 120) return { error: "Enter a name between 2 and 120 characters." };
    if (!validEmail(applicantEmail)) return { error: "Enter a valid email address." };

    const resumeValue = formData.get("resume");
    const resume = resumeValue instanceof File && resumeValue.size > 0 ? resumeValue : null;
    const photoValue = formData.get("photo");
    const photo = photoValue instanceof File && photoValue.size > 0 ? photoValue : null;
    if (requiredFields.require_resume && !resume) return { error: "Upload your resume to apply for this job." };
    if (requiredFields.require_photo && !photo) return { error: "Upload your applicant photo to apply for this job." };

    const rawSkills = (formData.get("skills") ?? "").toString();
    const skills = [...new Set(rawSkills.split(",").map((skill) => skill.trim()).filter(Boolean))];
    if (skills.length > 25 || skills.some((skill) => skill.length > 64)) return { error: "Enter at most 25 skills, each 64 characters or fewer." };
    if (requiredFields.require_skills && skills.length === 0) return { error: "Add at least one relevant skill." };

    const customAnswers: Record<string, string> = {};
    for (const question of requiredFields.custom_questions) {
      const answer = (formData.get(`answer:${question.id}`) ?? "").toString().trim();
      if (question.required && !answer) return { error: `Answer the question: ${question.label}` };
      if (answer.length > 2000) return { error: "Keep each custom answer under 2,000 characters." };
      if (question.type === "multiple_choice" && answer && !question.options.includes(answer)) {
        return { error: `Choose a valid answer for: ${question.label}` };
      }
      customAnswers[question.id] = answer;
    }

    const resumePath = resume ? await uploadResume(resume, session.user.id, job.id, storageClient) : null;
    if (resumePath) uploadedPaths.push(resumePath);
    const photoPath = photo ? await uploadPhoto(photo, session.user.id, job.id, uploads) : null;
    if (photoPath) uploadedPaths.push(photoPath);

    const { error } = await client.from("job_applications").insert({
      job_id: job.id,
      user_id: session.user.id,
      applicant_name: applicantName,
      applicant_email: applicantEmail,
      resume_url: resumePath,
      photo_url: photoPath,
      skills,
      custom_answers: customAnswers,
    });
    if (error) {
      console.error("Job Application Submission Error:", error);
      await removeCareerUploads(uploads, uploadedPaths);
      return { error: error.code === "23505" ? "You have already applied for this job." : "Your application could not be submitted. Try again." };
    }
  } catch (error) {
    unstable_rethrow(error);
    console.error("Job Application Submission Error:", error);
    if (storageClient) await removeCareerUploads(storageClient, uploadedPaths);
    return { error: error instanceof Error ? error.message : "Your application could not be submitted." };
  }

  const jobId = (formData.get("jobId") ?? "").toString();
  revalidatePath(`/careers/${jobId}`);
  revalidatePath("/careers/my-applications");
  return { success: "Your application was submitted successfully. You can track its status here." };
}