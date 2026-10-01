/**
 * Cross-file rules for config/recipe-collections.json that its JSON schema
 * cannot express: collection ids are unique, and every recipe the developer
 * site lists (anything not `hidden`, including preview recipes) belongs to
 * exactly one collection. Hidden recipes are never generated on the site, so
 * a collection must not reference them.
 *
 * @param {{ collections: { id: string, recipes: string[] }[] }} config
 * @param {{ id: string, hidden?: boolean }[]} recipes
 * @returns {string[]} one message per problem; empty when valid
 */
export function checkRecipeCollections(config, recipes) {
  const errors = [];
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const seenCollections = new Set();
  const homes = new Map();

  for (const collection of config.collections) {
    if (seenCollections.has(collection.id)) {
      errors.push(`collection id "${collection.id}" is used more than once`);
    }
    seenCollections.add(collection.id);

    for (const recipeId of collection.recipes) {
      const recipe = byId.get(recipeId);
      if (!recipe) {
        errors.push(
          `collection "${collection.id}" lists unknown recipe "${recipeId}"`,
        );
        continue;
      }
      if (recipe.hidden === true) {
        errors.push(
          `collection "${collection.id}" lists hidden recipe "${recipeId}"; remove it until the recipe is unhidden`,
        );
        continue;
      }
      const home = homes.get(recipeId);
      if (home) {
        errors.push(
          `recipe "${recipeId}" is in both "${home}" and "${collection.id}"; a recipe belongs to one collection`,
        );
        continue;
      }
      homes.set(recipeId, collection.id);
    }
  }

  for (const recipe of recipes) {
    if (recipe.hidden !== true && !homes.has(recipe.id)) {
      errors.push(
        `recipe "${recipe.id}" is listed on the site but is in no collection; add it to config/recipe-collections.json`,
      );
    }
  }

  return errors;
}
