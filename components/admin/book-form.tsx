"use client";

import Link from "next/link";
import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { BookCoverImage } from "@/components/books/book-cover-image";
import { ButtonLabel } from "@/components/button-label";
import type { Book } from "@/data/books";
import type { Category } from "@/data/categories";
import type { AdminBookReview } from "@/lib/database.types";
import type { BookFormState } from "@/app/admin/(protected)/books/actions";

type BookFormAction = (state: BookFormState, formData: FormData) => Promise<BookFormState>;

type BookFormProps = {
  action: BookFormAction;
  book?: Book;
  categories: Category[];
  mode: "create" | "edit";
  availabilityLocked?: boolean;
  lockedAvailability?: Book["availability"];
  defaultBookNumber?: string;
  defaultValues?: {
    isbn?: string;
    subcategory?: string;
    edition?: string;
    tags?: string;
    publicationYear?: string;
  };
};

export function BookForm({ action, book, categories, mode, availabilityLocked = false, lockedAvailability, defaultBookNumber, defaultValues }: BookFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [preview, setPreview] = useState(book?.cover ?? null);
  const [adminReviews, setAdminReviews] = useState<AdminBookReview[]>(book?.adminReviews ?? []);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  function updatePreview(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPreview(file ? URL.createObjectURL(file) : book?.cover ?? null);
  }

  function updateReview(reviewId: string, changes: Partial<AdminBookReview>) {
    setAdminReviews((current) => current.map((review) => review.review_id === reviewId ? { ...review, ...changes } : review));
  }

  return (
    <form action={formAction} className="admin-book-form">
      {defaultBookNumber ? <input name="bookNumber" type="hidden" value={defaultBookNumber} /> : null}
      {state.error ? <p className="admin-form-error admin-form-summary" role="alert">{state.error}</p> : null}
      <div className="admin-form-columns">
        <div className="admin-form-main">
          <label className="admin-form-field">Title <span>*</span>
            <input defaultValue={book?.title ?? ""} maxLength={200} name="title" required />
            {state.fieldErrors?.title ? <small role="alert">{state.fieldErrors.title}</small> : null}
          </label>
          <label className="admin-form-field">Author <span>*</span>
            <input defaultValue={book?.author ?? ""} maxLength={120} name="author" required />
            {state.fieldErrors?.author ? <small role="alert">{state.fieldErrors.author}</small> : null}
          </label>
          <label className="admin-form-field">Category <span>*</span>
            <select defaultValue={book?.categoryId ?? ""} name="categoryId" required>
              <option disabled value="">Choose a category</option>
              {categories.map((category) => <option key={category.id ?? category.slug} value={category.id ?? ""}>{category.name}</option>)}
            </select>
            {state.fieldErrors?.categoryId ? <small role="alert">{state.fieldErrors.categoryId}</small> : null}
          </label>
          <label className="admin-form-field">Subcategory
            <input defaultValue={book?.subcategory ?? defaultValues?.subcategory ?? defaultBookNumber ?? ""} maxLength={120} name="subcategory" />
            {state.fieldErrors?.subcategory ? <small role="alert">{state.fieldErrors.subcategory}</small> : null}
          </label>
          <label className="admin-form-field">Description <span>*</span>
            <textarea defaultValue={book?.description ?? ""} maxLength={10000} name="description" required rows={6} />
            {state.fieldErrors?.description ? <small role="alert">{state.fieldErrors.description}</small> : null}
          </label>
          <label className="admin-form-field">Tags <span className="admin-field-hint">Separate with commas</span>
            <input defaultValue={book?.tags.join(", ") ?? defaultValues?.tags ?? defaultBookNumber ?? ""} maxLength={1300} name="tags" />
            {state.fieldErrors?.tags ? <small role="alert">{state.fieldErrors.tags}</small> : null}
          </label>
        </div>
        <div className="admin-form-side">
          <div className="admin-cover-preview">
            <div className="admin-cover-preview-frame">
              {preview ? <Image alt={`Cover preview for ${book?.title ?? "new book"}`} fill sizes="94px" src={preview} unoptimized /> : <BookCoverImage author={book?.author ?? ""} cover={null} sizes="180px" title={book?.title ?? "Your book cover"} />}
            </div>
            <label className="admin-form-field">Book Cover
              <input accept="image/jpeg,image/png" name="cover" onChange={updatePreview} type="file" />
              <small>JPG, PNG or WEBP. Maximum 5 MB.</small>
            </label>
          </div>
          <label className="admin-form-field">Edition
            <input defaultValue={book?.edition ?? defaultValues?.edition ?? defaultBookNumber ?? ""} maxLength={80} name="edition" />
            {state.fieldErrors?.edition ? <small role="alert">{state.fieldErrors.edition}</small> : null}
          </label>
          <label className="admin-form-field">Language
            <input defaultValue={book?.language ?? ""} maxLength={60} name="language" />
            {state.fieldErrors?.language ? <small role="alert">{state.fieldErrors.language}</small> : null}
          </label>
          <label className="admin-form-field">ISBN
            <input defaultValue={book?.isbn ?? defaultValues?.isbn ?? defaultBookNumber ?? ""} maxLength={32} name="isbn" />
            {state.fieldErrors?.isbn ? <small role="alert">{state.fieldErrors.isbn}</small> : null}
          </label>
          <label className="admin-form-field">Publication Year
            <input defaultValue={book?.year ?? defaultValues?.publicationYear ?? "1111"} max="2200" min="-3000" name="publicationYear" step="1" type="number" />
            {state.fieldErrors?.publicationYear ? <small role="alert">{state.fieldErrors.publicationYear}</small> : null}
          </label>
          <label className="admin-form-field">Availability <span>*</span>
            <select defaultValue={lockedAvailability ?? book?.availability ?? "available"} disabled={availabilityLocked} name={availabilityLocked ? undefined : "availability"} required>
              <option value="available">Available</option>
              <option value="limited">Limited</option>
              <option value="unavailable">Unavailable</option>
            </select>
            {availabilityLocked ? <><input name="availability" type="hidden" value={lockedAvailability ?? book?.availability ?? "unavailable"} /><small>Availability is controlled by a rental or pending request and cannot be changed here.</small></> : null}
            {state.fieldErrors?.availability ? <small role="alert">{state.fieldErrors.availability}</small> : null}
          </label>
          <label className="admin-featured-control"><input defaultChecked={book?.featured ?? false} name="featured" type="checkbox" /><span>Featured book</span></label>
        </div>
      </div>
      <section aria-labelledby="admin-book-reviews-heading" className="admin-book-review-manager">
        <div className="admin-book-review-heading">
          <div><h2 className="display-font" id="admin-book-reviews-heading">Custom Reviews</h2><p>Add genuine reader feedback. Blank names display as “Anonymous reader”; mark a source verified only after checking it.</p></div>
          <button className="button-outline" disabled={adminReviews.length >= 100 || pending} onClick={() => setAdminReviews((current) => [...current, {
            review_id: crypto.randomUUID(),
            author_name: "",
            rating: 5,
            comment: "",
            is_verified: false,
          }])} type="button">+ Add Review</button>
        </div>
        <input name="adminReviews" type="hidden" value={JSON.stringify(adminReviews)} />
        {adminReviews.length ? <div className="admin-book-review-list">{adminReviews.map((review, index) => <fieldset className="admin-book-review-row" key={review.review_id}>
          <legend>Review {index + 1}</legend>
          <label className="admin-form-field">Star rating
            <select onChange={(event) => updateReview(review.review_id, { rating: Number(event.target.value) })} value={review.rating}>
              {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} {rating === 1 ? "star" : "stars"}</option>)}
            </select>
          </label>
          <label className="admin-form-field">Reviewer name <span>(optional)</span>
            <input autoComplete="off" maxLength={80} onChange={(event) => updateReview(review.review_id, { author_name: event.target.value })} value={review.author_name} />
          </label>
          <label className="admin-form-field">Review comment
            <textarea maxLength={2000} onChange={(event) => updateReview(review.review_id, { comment: event.target.value })} required rows={4} value={review.comment} />
          </label>
          <label className="admin-book-review-verified"><input checked={review.is_verified} onChange={(event) => updateReview(review.review_id, { is_verified: event.target.checked })} type="checkbox" /> Source verified</label>
          <button className="admin-action-button" disabled={pending} onClick={() => setAdminReviews((current) => current.filter((entry) => entry.review_id !== review.review_id))} type="button">Delete review</button>
        </fieldset>)}</div> : <p className="admin-empty-note">No custom reviews added.</p>}
        {state.fieldErrors?.reviews ? <small role="alert">{state.fieldErrors.reviews}</small> : null}
      </section>
      <div className="admin-form-actions">
        <Link className="button-outline" href="/ashik-loves-jannat/books">Cancel</Link>
        <button aria-busy={pending} className="button-primary button-stateful" disabled={pending} type="submit"><ButtonLabel pending={pending} pendingLabel="Saving...">{mode === "create" ? "Add Book" : "Save Changes"}</ButtonLabel></button>
      </div>
    </form>
  );
}
