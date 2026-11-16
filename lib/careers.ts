import type { JobRequiredFields } from "@/lib/database.types";

export type CareerQuestion = JobRequiredFields["custom_questions"][number];

export function parseJobRequiredFields(value: unknown): JobRequiredFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { require_resume: false, require_photo: false, require_skills: false, custom_questions: [] };
  }

  const record = value as Record<string, unknown>;
  const seenIds = new Set<string>();
  const questions = Array.isArray(record.custom_questions)
    ? record.custom_questions.flatMap((item, index): CareerQuestion[] => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const question = item as Record<string, unknown>;
      if (typeof question.label !== "string") return [];
      const label = question.label.trim();
      if (label.length < 2 || label.length > 200) return [];
      const requestedId = typeof question.id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(question.id)
        ? question.id
        : `question_${index + 1}`;
      const id = seenIds.has(requestedId) ? `question_${index + 1}` : requestedId;
      if (seenIds.has(id)) return [];
      seenIds.add(id);
      const requestedType = question.type === "essay" || question.type === "multiple_choice" ? question.type : "text";
      const options = Array.isArray(question.options)
        ? question.options.filter((option): option is string => typeof option === "string").map((option) => option.trim()).filter(Boolean).slice(0, 10)
        : [];
      const type = requestedType === "multiple_choice" && options.length >= 2 ? requestedType : requestedType === "multiple_choice" ? "text" : requestedType;
      return [{ id, label, required: question.required !== false, type, options: type === "multiple_choice" ? options : [] }];
    }).slice(0, 10)
    : [];

  return {
    require_resume: record.require_resume === true,
    require_photo: record.require_photo === true,
    require_skills: record.require_skills === true,
    custom_questions: questions,
  };
}