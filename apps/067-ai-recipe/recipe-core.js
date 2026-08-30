(function attachRecipeCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RecipeCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createRecipeCore() {
  'use strict';

  const MAX_INGREDIENTS = 30;
  const DIETS = new Set(['any', 'vegetarian', 'vegan', 'high-protein', 'low-carb']);
  const ALIASES = new Map(Object.entries({
    '西红柿': '番茄', '圣女果': '番茄', '小番茄': '番茄',
    '雞蛋': '鸡蛋', '蛋': '鸡蛋',
    '雞胸': '鸡胸肉', '鸡胸': '鸡胸肉', '雞胸肉': '鸡胸肉',
    '洋芋': '土豆', '马铃薯': '土豆', '馬鈴薯': '土豆',
    '青花菜': '西兰花', '西藍花': '西兰花',
    '洋菇': '蘑菇', '口蘑': '蘑菇',
    '面': '面条', '麵條': '面条', '義大利麵': '意面', '意大利面': '意面',
    '青葱': '小葱', '香葱': '小葱', '蔥': '小葱',
    '蒜头': '大蒜', '蒜': '大蒜',
    '紅蘿蔔': '胡萝卜', '红萝卜': '胡萝卜',
    '豆腐块': '豆腐', '嫩豆腐': '豆腐', '老豆腐': '豆腐',
    '牛肉片': '牛肉', '豬肉': '猪肉', '蝦仁': '虾仁',
    '米饭': '米饭', '白饭': '米饭', '白飯': '米饭',
  }));

  function stripMarkup(value, maxLength) {
    const limit = Number.isFinite(maxLength) ? maxLength : 120;
    return String(value == null ? '' : value)
      .normalize('NFKC')
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]*>/g, '')
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, limit);
  }

  function normalizeIngredient(value) {
    let ingredient = stripMarkup(value, 50).toLowerCase();
    ingredient = ingredient
      .replace(/^\d+(?:\.\d+)?\s*(?:千克|公斤|kg|克|g|毫升|ml|个|颗|只|根|片|块|勺|杯|把|瓣)\s*/i, '')
      .replace(/\s*\d+(?:\.\d+)?\s*(?:千克|公斤|kg|克|g|毫升|ml|个|颗|只|根|片|块|勺|杯|把|瓣)$/i, '')
      .replace(/[()（）]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return ALIASES.get(ingredient) || ingredient;
  }

  function parseIngredients(value) {
    const source = Array.isArray(value)
      ? value
      : String(value == null ? '' : value).split(/[,，、;；\n]+/);
    const result = [];
    const seen = new Set();
    for (const item of source) {
      const normalized = normalizeIngredient(item);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      result.push(normalized);
      if (result.length >= MAX_INGREDIENTS) break;
    }
    return result;
  }

  function clampNumber(value, minimum, maximum, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(number)));
  }

  function normalizeRequest(input) {
    const value = input && typeof input === 'object' ? input : {};
    const diet = DIETS.has(value.diet) ? value.diet : 'any';
    const cuisine = stripMarkup(value.cuisine || 'any', 30) || 'any';
    return {
      ingredients: parseIngredients(value.ingredients),
      servings: clampNumber(value.servings, 1, 8, 2),
      maxMinutes: clampNumber(value.maxMinutes, 10, 180, 45),
      diet,
      cuisine,
      exclude: parseIngredients(value.exclude),
      utensils: parseIngredients(value.utensils),
    };
  }

  function ingredientNames(item) {
    if (!item || typeof item !== 'object') return [];
    return parseIngredients([item.name, ...(Array.isArray(item.alternatives) ? item.alternatives : [])]);
  }

  function pantryHas(item, pantrySet) {
    return ingredientNames(item).some((name) => pantrySet.has(name));
  }

  function dietMatches(recipe, diet) {
    if (diet === 'any') return true;
    const tags = new Set(Array.isArray(recipe.diets) ? recipe.diets : []);
    if (diet === 'vegetarian') return tags.has('vegetarian') || tags.has('vegan');
    return tags.has(diet);
  }

  function exclusionMatches(recipe, exclusions) {
    if (!exclusions.length) return false;
    const blocked = new Set(exclusions);
    const recipeTerms = [
      ...(Array.isArray(recipe.allergens) ? recipe.allergens : []),
      ...(Array.isArray(recipe.ingredients) ? recipe.ingredients.flatMap(ingredientNames) : []),
    ].map(normalizeIngredient).filter(Boolean);
    return recipeTerms.some((term) => blocked.has(term));
  }

  function scoreRecipe(recipe, rawRequest) {
    const request = normalizeRequest(rawRequest);
    const pantry = new Set(request.ingredients);
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const required = ingredients.filter((item) => item.required !== false);
    const optional = ingredients.filter((item) => item.required === false);
    const matchedRequired = required.filter((item) => pantryHas(item, pantry));
    const matchedOptional = optional.filter((item) => pantryHas(item, pantry));
    const missingItems = required.filter((item) => !pantryHas(item, pantry));
    const coverage = required.length ? matchedRequired.length / required.length : 0;
    const optionalCoverage = optional.length ? matchedOptional.length / optional.length : 0;
    const cuisineBonus = request.cuisine !== 'any' && recipe.cuisine === request.cuisine ? 8 : 0;
    const dietBonus = request.diet !== 'any' && dietMatches(recipe, request.diet) ? 7 : 0;
    const timeRatio = Math.min(1, Math.max(0, 1 - (Number(recipe.minutes) || 0) / request.maxMinutes));
    const score = Math.max(0, Math.min(100, Math.round(
      coverage * 75 + optionalCoverage * 10 + cuisineBonus + dietBonus + timeRatio * 5,
    )));
    const allMatched = required.length > 0 && matchedRequired.length === required.length;
    const reason = allMatched
      ? `已有 ${matchedRequired.length}/${required.length} 样主料，冰箱匹配完整`
      : `已有 ${matchedRequired.length}/${required.length} 样主料，还差 ${missingItems.length} 样即可开做`;

    return {
      ...recipe,
      score,
      matchPercent: Math.round(coverage * 100),
      available: [...matchedRequired, ...matchedOptional].map((item) => normalizeIngredient(item.name)),
      missing: missingItems.map((item) => normalizeIngredient(item.name)),
      reason,
      relaxed: false,
    };
  }

  function recommendRecipes(rawRequest, recipeCatalog, options) {
    const request = normalizeRequest(rawRequest);
    const catalog = Array.isArray(recipeCatalog) ? recipeCatalog : [];
    const settings = options && typeof options === 'object' ? options : {};
    if (!request.ingredients.length) return [];

    return catalog
      .filter((recipe) => recipe && typeof recipe === 'object')
      .filter((recipe) => dietMatches(recipe, request.diet))
      .filter((recipe) => !exclusionMatches(recipe, request.exclude))
      .filter((recipe) => settings.ignoreTime || Number(recipe.minutes) <= request.maxMinutes)
      .map((recipe) => scoreRecipe(recipe, request))
      .filter((recipe) => recipe.available.length > 0)
      .sort((left, right) => (
        right.score - left.score
        || left.missing.length - right.missing.length
        || Number(left.minutes) - Number(right.minutes)
        || String(left.title).localeCompare(String(right.title), 'zh-CN')
      ))
      .slice(0, 3);
  }

  function relaxAndRecommend(rawRequest, recipeCatalog) {
    const strict = recommendRecipes(rawRequest, recipeCatalog);
    if (strict.length) return { recipes: strict, relaxed: false, note: '' };
    const relaxed = recommendRecipes(rawRequest, recipeCatalog, { ignoreTime: true })
      .map((recipe) => ({ ...recipe, relaxed: true }));
    return {
      recipes: relaxed,
      relaxed: relaxed.length > 0,
      note: relaxed.length ? '没有菜谱满足原定时间，已仅放宽烹饪时长；饮食与忌口条件保持不变。' : '',
    };
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value)) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function safeNutrition(value) {
    const source = value && typeof value === 'object' ? value : {};
    return ['calories', 'protein', 'carbs', 'fat'].reduce((result, key) => {
      const number = Number(source[key]);
      if (Number.isFinite(number) && number >= 0 && number <= 5000) result[key] = Math.round(number);
      return result;
    }, {});
  }

  function sanitizeAIRecipes(payload, rawRequest) {
    const source = Array.isArray(payload) ? payload : payload && payload.recipes;
    if (!Array.isArray(source)) return [];
    const request = normalizeRequest(rawRequest);
    const pantry = new Set(request.ingredients);
    const result = [];

    for (const [index, item] of source.entries()) {
      if (!item || typeof item !== 'object') continue;
      const title = stripMarkup(item.title, 60);
      const minutes = clampNumber(item.minutes, 5, 240, NaN);
      const rawIngredients = Array.isArray(item.ingredients) ? item.ingredients.slice(0, 20) : [];
      const ingredients = rawIngredients.map((ingredient) => {
        const record = typeof ingredient === 'string' ? { name: ingredient } : ingredient || {};
        const name = normalizeIngredient(record.name);
        if (!name) return null;
        return {
          name,
          amount: stripMarkup(record.amount || '适量', 30) || '适量',
          required: record.required !== false,
          alternatives: parseIngredients(record.alternatives || []).slice(0, 3),
        };
      }).filter(Boolean);
      const steps = (Array.isArray(item.steps) ? item.steps : [])
        .slice(0, 12)
        .map((step) => stripMarkup(step, 220))
        .filter(Boolean);

      if (!title || !Number.isFinite(minutes) || ingredients.length < 2 || steps.length < 2) continue;
      const available = ingredients.filter((ingredient) => pantryHas(ingredient, pantry)).map((ingredient) => ingredient.name);
      const missing = ingredients.filter((ingredient) => !pantryHas(ingredient, pantry)).map((ingredient) => ingredient.name);
      const matchPercent = Math.round((available.length / ingredients.length) * 100);
      const cuisine = stripMarkup(item.cuisine || '创意料理', 30) || '创意料理';
      const difficulty = ['容易', '中等', '挑战'].includes(item.difficulty) ? item.difficulty : '中等';
      const servings = clampNumber(item.servings, 1, 8, request.servings);
      result.push({
        id: `ai-${stableHash(`${title}-${index}`)}`,
        title,
        cuisine,
        minutes,
        difficulty,
        servings,
        diets: Array.isArray(item.diets) ? item.diets.map((tag) => stripMarkup(tag, 24)).filter(Boolean).slice(0, 5) : [],
        allergens: Array.isArray(item.allergens) ? item.allergens.map((tag) => stripMarkup(tag, 24)).filter(Boolean).slice(0, 8) : [],
        utensils: Array.isArray(item.utensils) ? item.utensils.map((tag) => stripMarkup(tag, 24)).filter(Boolean).slice(0, 8) : [],
        ingredients,
        steps,
        substitutions: Array.isArray(item.substitutions)
          ? item.substitutions.map((entry) => stripMarkup(entry, 100)).filter(Boolean).slice(0, 6)
          : [],
        nutrition: safeNutrition(item.nutrition),
        available,
        missing,
        matchPercent,
        score: Math.min(100, matchPercent + 8),
        reason: stripMarkup(item.reason, 120) || `现有食材可覆盖约 ${matchPercent}%`,
        source: 'ai',
        relaxed: false,
      });
      if (result.length >= 3) break;
    }
    return result;
  }

  return {
    MAX_INGREDIENTS,
    normalizeIngredient,
    parseIngredients,
    normalizeRequest,
    scoreRecipe,
    recommendRecipes,
    relaxAndRecommend,
    sanitizeAIRecipes,
  };
}));
