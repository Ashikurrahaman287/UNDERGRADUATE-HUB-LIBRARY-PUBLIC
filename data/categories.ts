export type Category = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  introduction: string;
  isActive?: boolean;
};

export const categories: Category[] = [
  { slug: "novels", name: "Novels", description: "A story to step inside", introduction: "Character, place and possibility unfold one page at a time. Find a novel and settle in." },
  { slug: "fiction", name: "Fiction", description: "Stories that stay with you", introduction: "From intimate character studies to expansive imagined worlds, fiction gives us a hundred ways to see our own." },
  { slug: "science-fiction", name: "Sci-Fi", description: "Worlds beyond this one", introduction: "Speculative futures, distant worlds and questions about what it means to be human." },
  { slug: "fantasy", name: "Fantasy", description: "A little room for wonder", introduction: "Myth, magic and imagined places that make the everyday feel newly possible." },
  { slug: "mystery-thriller", name: "Mystery & Thriller", description: "One more chapter", introduction: "Clever clues, shadowed motives and stories that make it hard to put the book down." },
  { slug: "romance", name: "Romance", description: "Connection, longing and love", introduction: "Tender beginnings, complicated feelings and the many ways people find one another." },
  { slug: "psychology", name: "Psychology", description: "Books exploring the human mind, behavior, emotions and thought.", introduction: "Books exploring the human mind, behavior, emotions and thought." },
  { slug: "philosophy", name: "Philosophy", description: "Questions worth keeping", introduction: "Old and new ideas to help us think carefully about how to live." },
  { slug: "religion", name: "Religion", description: "Traditions and belief", introduction: "Thoughtful writing on faith, sacred traditions and the questions that connect us." },
  { slug: "spirituality", name: "Spirituality", description: "Ways of finding perspective", introduction: "Reflections on presence, compassion and a deeper sense of connection." },
  { slug: "self-development", name: "Self Development", description: "Small ideas, meaningful change", introduction: "Practical and reflective reading for learning, growing and finding a little more balance." },
  { slug: "biography", name: "Biography", description: "Lives in their own words", introduction: "True stories of people shaped by their choices, circumstances and convictions." },
  { slug: "history", name: "History", description: "The past, still in motion", introduction: "Readable histories that bring people, places and pivotal moments into focus." },
  { slug: "science", name: "Science", description: "Big questions, clearly explored", introduction: "Accessible reads about discovery, the natural world and how everything fits together." },
  { slug: "other", name: "Other", description: "The books that resist a label", introduction: "Essays, nature writing and unexpected finds that deserve a place on the shelf." },
];

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((category) => category.slug === slug);
}