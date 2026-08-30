const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeIngredient,
  parseIngredients,
  normalizeRequest,
  scoreRecipe,
  recommendRecipes,
  relaxAndRecommend,
  sanitizeAIRecipes,
} = require('./recipe-core');

const recipes = [
  {
    id: 'tomato-egg', title: '番茄炒蛋', cuisine: '家常', minutes: 15, difficulty: '容易',
    diets: ['vegetarian', 'high-protein'], allergens: ['鸡蛋'], servings: 2,
    ingredients: [
      { name: '番茄', amount: '2 个', required: true },
      { name: '鸡蛋', amount: '3 个', required: true },
      { name: '小葱', amount: '1 根', required: false },
    ],
    steps: ['切番茄。', '炒蛋后加入番茄。'],
  },
  {
    id: 'mushroom-pasta', title: '蒜香蘑菇意面', cuisine: '西式', minutes: 25, difficulty: '容易',
    diets: ['vegetarian'], allergens: ['麸质', '乳制品'], servings: 2,
    ingredients: [
      { name: '意面', amount: '180 克', required: true, alternatives: ['面条'] },
      { name: '蘑菇', amount: '200 克', required: true },
      { name: '黄油', amount: '15 克', required: false, alternatives: ['橄榄油'] },
    ],
    steps: ['煮面。', '炒香蘑菇后拌面。'],
  },
  {
    id: 'chicken-bowl', title: '鸡胸时蔬碗', cuisine: '轻食', minutes: 35, difficulty: '中等',
    diets: ['high-protein', 'low-carb'], allergens: [], servings: 2,
    ingredients: [
      { name: '鸡胸肉', amount: '300 克', required: true },
      { name: '西兰花', amount: '200 克', required: true },
      { name: '胡萝卜', amount: '1 根', required: false },
    ],
    steps: ['煎鸡胸。', '焯蔬菜后装碗。'],
  },
  {
    id: 'pumpkin-curry', title: '南瓜鹰嘴豆咖喱', cuisine: '东南亚', minutes: 40, difficulty: '中等',
    diets: ['vegetarian', 'vegan'], allergens: [], servings: 3,
    ingredients: [
      { name: '南瓜', amount: '400 克', required: true },
      { name: '鹰嘴豆', amount: '200 克', required: true },
      { name: '椰奶', amount: '200 毫升', required: true },
    ],
    steps: ['炒香咖喱。', '加入食材炖煮。'],
  },
];

test('normalizes Chinese ingredient aliases and removes simple quantities', () => {
  assert.equal(normalizeIngredient(' 西红柿 '), '番茄');
  assert.equal(normalizeIngredient('2个雞蛋'), '鸡蛋');
  assert.equal(normalizeIngredient('洋芋 300克'), '土豆');
  assert.equal(normalizeIngredient('<b>蘑菇</b>'), '蘑菇');
});

test('parses mixed delimiters, arrays and duplicate aliases', () => {
  assert.deepEqual(parseIngredients('番茄，鸡蛋、 西红柿; 小葱\n蘑菇'), ['番茄', '鸡蛋', '小葱', '蘑菇']);
  assert.deepEqual(parseIngredients(['雞胸', '鸡胸肉', '', null]), ['鸡胸肉']);
  assert.equal(parseIngredients(Array.from({ length: 35 }, (_, index) => `食材${index}`)).length, 30);
});

test('normalizes request boundaries and preserves strict exclusions', () => {
  const result = normalizeRequest({
    ingredients: '番茄、鸡蛋', servings: 99, maxMinutes: 2,
    diet: 'vegan', cuisine: '<b>家常</b>', exclude: '花生，乳制品', utensils: ['炒锅', '炒锅'],
  });
  assert.deepEqual(result.ingredients, ['番茄', '鸡蛋']);
  assert.equal(result.servings, 8);
  assert.equal(result.maxMinutes, 10);
  assert.equal(result.diet, 'vegan');
  assert.equal(result.cuisine, '家常');
  assert.deepEqual(result.exclude, ['花生', '乳制品']);
  assert.deepEqual(result.utensils, ['炒锅']);
});

test('scores pantry coverage, alternatives, cuisine and missing ingredients', () => {
  const request = normalizeRequest({ ingredients: '面条、蘑菇、橄榄油', cuisine: '西式', maxMinutes: 30 });
  const result = scoreRecipe(recipes[1], request);
  assert.deepEqual(result.available, ['意面', '蘑菇', '黄油']);
  assert.deepEqual(result.missing, []);
  assert.ok(result.score >= 90);
  assert.equal(result.matchPercent, 100);
});

test('recommendations honor diet, exclusions and maximum time before ranking', () => {
  const vegan = recommendRecipes({ ingredients: '南瓜、鹰嘴豆、椰奶、番茄', diet: 'vegan', maxMinutes: 60 }, recipes);
  assert.deepEqual(vegan.map((recipe) => recipe.id), ['pumpkin-curry']);

  const noEgg = recommendRecipes({ ingredients: '番茄、鸡蛋、意面、蘑菇', exclude: '鸡蛋', maxMinutes: 30 }, recipes);
  assert.equal(noEgg.some((recipe) => recipe.id === 'tomato-egg'), false);
  assert.equal(noEgg[0].id, 'mushroom-pasta');
});

test('ranking is stable and reports why a recipe matches', () => {
  const result = recommendRecipes({ ingredients: '西红柿、鸡蛋、蘑菇', maxMinutes: 60 }, recipes);
  assert.equal(result[0].id, 'tomato-egg');
  assert.equal(result[0].matchPercent, 100);
  assert.match(result[0].reason, /2.*2|全部/);
  assert.ok(result.every((recipe) => Array.isArray(recipe.missing)));
});

test('relaxed recommendations never relax allergy or diet constraints', () => {
  const result = relaxAndRecommend({
    ingredients: '南瓜、鹰嘴豆、椰奶', diet: 'vegan', exclude: '花生', maxMinutes: 10,
  }, recipes);
  assert.equal(result.relaxed, true);
  assert.deepEqual(result.recipes.map((recipe) => recipe.id), ['pumpkin-curry']);
  assert.ok(result.recipes.every((recipe) => recipe.diets.includes('vegan')));
});

test('sanitizes provider recipes and rejects malformed output', () => {
  const result = sanitizeAIRecipes({ recipes: [
    {
      title: '<img src=x onerror=alert(1)>番茄焖饭', cuisine: '家常', minutes: 28,
      difficulty: '容易', servings: 2, reason: '<b>用掉现有番茄</b>',
      ingredients: [
        { name: '西红柿', amount: '2 个' },
        { name: '大米', amount: '180 克' },
        { name: '鸡蛋', amount: '2 个' },
      ],
      steps: ['<script>bad()</script>洗米。', '加入食材焖熟。'],
      nutrition: { calories: 520, protein: 20, carbs: 72, fat: 15 },
    },
    { title: '坏数据', minutes: '很久', ingredients: [], steps: [] },
  ] }, { ingredients: '番茄、鸡蛋' });

  assert.equal(result.length, 1);
  assert.equal(result[0].title, '番茄焖饭');
  assert.equal(result[0].ingredients[0].name, '番茄');
  assert.deepEqual(result[0].missing, ['大米']);
  assert.equal(result[0].steps[0], '洗米。');
  assert.equal(result[0].nutrition.calories, 520);
  assert.match(result[0].id, /^ai-/);
});

test('empty or hostile provider payloads produce no recipes', () => {
  assert.deepEqual(sanitizeAIRecipes(null, {}), []);
  assert.deepEqual(sanitizeAIRecipes({ recipes: [{ title: '<script>x</script>', minutes: 20 }] }, {}), []);
  assert.deepEqual(sanitizeAIRecipes({ recipes: 'not-an-array' }, {}), []);
});
