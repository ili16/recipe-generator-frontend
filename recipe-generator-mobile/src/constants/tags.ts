// Fixed recipe tagging taxonomy, mirroring the backend's internal/service/tags.go and
// db/migrations/00006_recipe_tags.sql. See recipe-generator/specs/RECIPE_TAGS.md.

export type TagGroup =
  | 'meal_type'
  | 'dietary'
  | 'time_difficulty'
  | 'cooking_method'
  | 'primary_ingredient'
  | 'cuisine_vibe';

export interface TagDef {
  slug: string;
  label: string;
  group: TagGroup;
}

export const TAG_GROUP_LABELS: Record<TagGroup, string> = {
  meal_type: 'Meal Type',
  dietary: 'Dietary & Allergens',
  time_difficulty: 'Time & Difficulty',
  cooking_method: 'Cooking Method',
  primary_ingredient: 'Primary Ingredient',
  cuisine_vibe: 'Cuisine & Vibe',
};

export const ALL_TAGS: TagDef[] = [
  { slug: 'breakfast-brunch', label: 'Breakfast & Brunch', group: 'meal_type' },
  { slug: 'appetizers-starters', label: 'Appetizers & Starters', group: 'meal_type' },
  { slug: 'main-courses', label: 'Main Courses', group: 'meal_type' },
  { slug: 'side-dishes', label: 'Side Dishes', group: 'meal_type' },
  { slug: 'desserts', label: 'Desserts', group: 'meal_type' },
  { slug: 'snacks', label: 'Snacks', group: 'meal_type' },
  { slug: 'beverages', label: 'Beverages', group: 'meal_type' },
  { slug: 'sauces-dressings', label: 'Sauces & Dressings', group: 'meal_type' },

  { slug: 'vegan', label: 'Vegan', group: 'dietary' },
  { slug: 'vegetarian', label: 'Vegetarian', group: 'dietary' },
  { slug: 'gluten-free', label: 'Gluten-Free', group: 'dietary' },
  { slug: 'dairy-free', label: 'Dairy-Free', group: 'dietary' },
  { slug: 'nut-free', label: 'Nut-Free', group: 'dietary' },
  { slug: 'keto', label: 'Keto', group: 'dietary' },
  { slug: 'low-carb', label: 'Low-Carb', group: 'dietary' },

  { slug: 'under-20-minutes', label: 'Under 20 Minutes', group: 'time_difficulty' },
  { slug: '30-minute-meals', label: '30-Minute Meals', group: 'time_difficulty' },
  { slug: 'easy-prep', label: 'Easy Prep', group: 'time_difficulty' },
  { slug: 'beginner-friendly', label: 'Beginner Friendly', group: 'time_difficulty' },
  { slug: 'meal-prep', label: 'Meal Prep', group: 'time_difficulty' },

  { slug: 'one-pot-one-pan', label: 'One-Pot / One-Pan', group: 'cooking_method' },
  { slug: 'no-cook', label: 'No-Cook', group: 'cooking_method' },
  { slug: 'baking', label: 'Baking', group: 'cooking_method' },
  { slug: 'air-fryer', label: 'Air Fryer', group: 'cooking_method' },
  { slug: 'slow-cooker', label: 'Slow Cooker', group: 'cooking_method' },
  { slug: 'instant-pot', label: 'Instant Pot', group: 'cooking_method' },
  { slug: 'grilling', label: 'Grilling', group: 'cooking_method' },

  { slug: 'chicken-poultry', label: 'Chicken & Poultry', group: 'primary_ingredient' },
  { slug: 'beef-red-meat', label: 'Beef & Red Meat', group: 'primary_ingredient' },
  { slug: 'pork', label: 'Pork', group: 'primary_ingredient' },
  { slug: 'seafood', label: 'Seafood', group: 'primary_ingredient' },
  { slug: 'pasta-grains', label: 'Pasta & Grains', group: 'primary_ingredient' },
  { slug: 'vegetables', label: 'Vegetables', group: 'primary_ingredient' },

  { slug: 'comfort-food', label: 'Comfort Food', group: 'cuisine_vibe' },
  { slug: 'healthy', label: 'Healthy', group: 'cuisine_vibe' },
  { slug: 'budget-friendly', label: 'Budget-Friendly', group: 'cuisine_vibe' },
  { slug: 'kid-friendly', label: 'Kid-Friendly', group: 'cuisine_vibe' },
  { slug: 'spicy', label: 'Spicy', group: 'cuisine_vibe' },
];

export const TAG_LABEL_BY_SLUG: Record<string, string> = Object.fromEntries(
  ALL_TAGS.map((t) => [t.slug, t.label])
);

export const TAGS_BY_GROUP: Record<TagGroup, TagDef[]> = ALL_TAGS.reduce(
  (acc, tag) => {
    acc[tag.group].push(tag);
    return acc;
  },
  {
    meal_type: [],
    dietary: [],
    time_difficulty: [],
    cooking_method: [],
    primary_ingredient: [],
    cuisine_vibe: [],
  } as Record<TagGroup, TagDef[]>
);

// Which meal-type tags make a recipe a likely candidate for a given slot. Used to *rank*
// the picker, never to filter it — people eat pizza for breakfast (BACKLOG 9.9).
export const SLOT_TAGS: Record<string, string[]> = {
  breakfast: ['breakfast-brunch', 'beverages'],
  lunch: ['main-courses', 'side-dishes', 'appetizers-starters'],
  dinner: ['main-courses', 'side-dishes', 'sauces-dressings'],
  snack: ['snacks', 'desserts', 'appetizers-starters', 'beverages'],
};
