(function startPantryApp() {
  'use strict';

  const Core = window.RecipeCore;
  if (!Core) throw new Error('RecipeCore failed to load');

  const STORAGE_KEY = 'pantry67.state.v1';
  const OFFLINE = new URLSearchParams(location.search).get('offline') === '1';
  const ingredient = (name, amount, required = true, alternatives = []) => ({ name, amount, required, alternatives });

  const RECIPES = [
    {
      id: 'tomato-egg', title: '番茄炒蛋', cuisine: '家常', minutes: 15, difficulty: '容易', servings: 2,
      diets: ['vegetarian', 'high-protein'], allergens: ['鸡蛋'], utensils: ['炒锅'],
      ingredients: [ingredient('番茄', '2 个'), ingredient('鸡蛋', '3 个'), ingredient('小葱', '1 根', false), ingredient('白糖', '1 小勺', false)],
      steps: ['番茄切滚刀块，鸡蛋加一小撮盐打散。', '热锅放油，鸡蛋炒至刚凝固就盛出，保留嫩度。', '原锅下番茄和少量盐，炒到出汁后回锅鸡蛋。', '翻匀 30 秒，按口味加糖，撒小葱出锅。'],
      substitutions: ['没有小葱可以不放，或换成少量香菜。', '番茄偏酸时加半小勺糖，不需要勾芡。'],
      nutrition: { calories: 285, protein: 18, carbs: 16, fat: 17 },
    },
    {
      id: 'shredded-potato', title: '醋香土豆丝', cuisine: '家常', minutes: 18, difficulty: '容易', servings: 2,
      diets: ['vegetarian', 'vegan'], allergens: [], utensils: ['炒锅'],
      ingredients: [ingredient('土豆', '2 个'), ingredient('青椒', '1 个', false), ingredient('大蒜', '2 瓣'), ingredient('米醋', '1.5 汤勺', true, ['陈醋'])],
      steps: ['土豆切细丝，用清水漂洗两遍后彻底沥干。', '锅烧热放油，下蒜末和青椒快速炒香。', '倒入土豆丝，大火翻炒约 2 分钟。', '沿锅边淋醋，加盐再翻 30 秒，保持爽脆。'],
      substitutions: ['没有青椒可用胡萝卜丝配色。', '陈醋颜色更深，建议减少到 1 汤勺。'],
      nutrition: { calories: 218, protein: 4, carbs: 39, fat: 6 },
    },
    {
      id: 'chicken-bowl', title: '煎鸡胸时蔬碗', cuisine: '轻食', minutes: 32, difficulty: '中等', servings: 2,
      diets: ['high-protein', 'low-carb'], allergens: [], utensils: ['平底锅', '汤锅'],
      ingredients: [ingredient('鸡胸肉', '300 克'), ingredient('西兰花', '220 克'), ingredient('胡萝卜', '1 根', false), ingredient('米饭', '2 碗', false, ['糙米饭'])],
      steps: ['鸡胸肉从中间片薄，加盐、黑胡椒和少量油腌 10 分钟。', '西兰花与胡萝卜焯水 2 分钟，捞出沥干。', '平底锅中火将鸡胸每面煎 4—5 分钟，静置后切片。', '蔬菜、鸡胸与可选米饭装碗，淋少量生抽或柠檬汁。'],
      substitutions: ['鸡胸肉可换成去皮鸡腿肉，煎制时间增加 2 分钟。', '低碳水模式可省略米饭，增加一份叶菜。'],
      nutrition: { calories: 438, protein: 49, carbs: 35, fat: 12 },
    },
    {
      id: 'mushroom-pasta', title: '蒜香蘑菇意面', cuisine: '西式', minutes: 25, difficulty: '容易', servings: 2,
      diets: ['vegetarian'], allergens: ['麸质', '乳制品'], utensils: ['汤锅', '平底锅'],
      ingredients: [ingredient('意面', '180 克', true, ['面条']), ingredient('蘑菇', '220 克'), ingredient('大蒜', '3 瓣'), ingredient('黄油', '15 克', false, ['橄榄油'])],
      steps: ['水沸后加盐，意面按包装时间少煮 1 分钟，留半杯面汤。', '蘑菇切片，干锅煸到水汽减少后加入黄油与蒜末。', '倒入意面和少量面汤，大火翻拌至酱汁挂面。', '加黑胡椒和盐调味，喜欢的话撒芝士。'],
      substitutions: ['普通面条可替代意面，但面汤淀粉更多，要少量加入。', '纯素版本用橄榄油，并省略芝士。'],
      nutrition: { calories: 486, protein: 16, carbs: 72, fat: 15 },
    },
    {
      id: 'kimchi-rice', title: '泡菜锅巴炒饭', cuisine: '日韩', minutes: 16, difficulty: '容易', servings: 2,
      diets: [], allergens: ['大豆', '鸡蛋'], utensils: ['炒锅'],
      ingredients: [ingredient('米饭', '2 碗'), ingredient('泡菜', '160 克'), ingredient('鸡蛋', '2 个', false), ingredient('小葱', '1 根', false)],
      steps: ['冷米饭提前拨散，泡菜挤出部分汁后切碎。', '锅中少油炒香泡菜，加入米饭大火翻散。', '沿锅边淋一勺泡菜汁，压平米饭煎 1 分钟形成锅巴。', '另煎鸡蛋盖在炒饭上，撒小葱。'],
      substitutions: ['没有隔夜饭可把新米饭摊开放凉 10 分钟。', '泡菜咸度不同，出锅前再决定是否加盐。'],
      nutrition: { calories: 510, protein: 17, carbs: 78, fat: 15 },
    },
    {
      id: 'miso-tofu', title: '味噌豆腐蔬菜汤', cuisine: '日韩', minutes: 20, difficulty: '容易', servings: 2,
      diets: ['vegetarian', 'vegan', 'low-carb'], allergens: ['大豆'], utensils: ['汤锅'],
      ingredients: [ingredient('豆腐', '250 克'), ingredient('蘑菇', '120 克'), ingredient('海带', '一小把', false), ingredient('味噌', '2 汤勺')],
      steps: ['海带泡软，豆腐切块，蘑菇切片。', '锅中加 600 毫升水，放海带和蘑菇煮 6 分钟。', '加入豆腐，小火再煮 3 分钟。', '关火后用汤勺化开味噌，避免沸腾破坏香气。'],
      substitutions: ['味噌可用一小勺生抽加少量芝麻酱代替，风味会不同。', '可加入白菜或菠菜增加蔬菜量。'],
      nutrition: { calories: 205, protein: 18, carbs: 14, fat: 9 },
    },
    {
      id: 'pepper-beef-rice', title: '黑椒牛肉饭', cuisine: '家常', minutes: 28, difficulty: '中等', servings: 2,
      diets: ['high-protein'], allergens: ['大豆'], utensils: ['炒锅'],
      ingredients: [ingredient('牛肉', '260 克'), ingredient('洋葱', '半个'), ingredient('青椒', '1 个', false), ingredient('米饭', '2 碗')],
      steps: ['牛肉逆纹切薄片，用生抽、淀粉和油抓匀腌 10 分钟。', '热锅大火把牛肉滑散，七成熟时立即盛出。', '原锅炒软洋葱和青椒，加入黑胡椒。', '牛肉回锅快速翻匀，连汁盖到热米饭上。'],
      substitutions: ['牛肉可换成猪里脊，仍需逆纹切片。', '没有青椒可只用洋葱，增加少量黑胡椒。'],
      nutrition: { calories: 612, protein: 39, carbs: 72, fat: 18 },
    },
    {
      id: 'shrimp-egg', title: '虾仁滑蛋', cuisine: '粤式', minutes: 16, difficulty: '中等', servings: 2,
      diets: ['high-protein', 'low-carb'], allergens: ['虾仁', '鸡蛋'], utensils: ['炒锅'],
      ingredients: [ingredient('虾仁', '180 克'), ingredient('鸡蛋', '4 个'), ingredient('小葱', '1 根', false), ingredient('牛奶', '1 汤勺', false, ['清水'])],
      steps: ['虾仁擦干，加少量盐和淀粉腌 5 分钟。', '鸡蛋加牛奶打散，小葱切末。', '虾仁煎至变色后转小火，倒入蛋液。', '用锅铲缓慢推蛋，八成熟即关火，余温会继续凝固。'],
      substitutions: ['牛奶只用于增加嫩度，可换等量清水。', '虾仁可换成蟹柳，但要注意成品含盐量。'],
      nutrition: { calories: 342, protein: 36, carbs: 5, fat: 20 },
    },
    {
      id: 'mapo-tofu', title: '家常麻婆豆腐', cuisine: '川味', minutes: 25, difficulty: '中等', servings: 3,
      diets: ['high-protein'], allergens: ['大豆'], utensils: ['炒锅'],
      ingredients: [ingredient('豆腐', '400 克'), ingredient('猪肉', '120 克'), ingredient('豆瓣酱', '1.5 汤勺'), ingredient('花椒', '1 小勺', false)],
      steps: ['豆腐切块，在淡盐水中煮 2 分钟后沥干。', '锅中炒散肉末，加入豆瓣酱炒出红油。', '加一小碗水和豆腐，中小火烧 6 分钟。', '分两次淋水淀粉轻推收汁，撒花椒粉。'],
      substitutions: ['猪肉可换牛肉末。', '想做素版可省略肉末，加入切碎的蘑菇增加鲜味。'],
      nutrition: { calories: 368, protein: 27, carbs: 13, fat: 24 },
    },
    {
      id: 'pumpkin-curry', title: '南瓜鹰嘴豆咖喱', cuisine: '东南亚', minutes: 40, difficulty: '中等', servings: 3,
      diets: ['vegetarian', 'vegan'], allergens: [], utensils: ['汤锅'],
      ingredients: [ingredient('南瓜', '450 克'), ingredient('鹰嘴豆', '240 克'), ingredient('椰奶', '240 毫升'), ingredient('咖喱粉', '1.5 汤勺')],
      steps: ['南瓜切 2 厘米块，鹰嘴豆沥干。', '锅中少油小火炒香咖喱粉，加入南瓜翻匀。', '倒入椰奶和 200 毫升水，加盖炖 15 分钟。', '加入鹰嘴豆再煮 8 分钟，用盐和柠檬汁调味。'],
      substitutions: ['鹰嘴豆可换白芸豆。', '椰奶不足时用一半牛奶替代，但不再是纯素。'],
      nutrition: { calories: 392, protein: 12, carbs: 48, fat: 18 },
    },
    {
      id: 'tuna-corn-salad', title: '金枪鱼玉米脆沙拉', cuisine: '轻食', minutes: 12, difficulty: '容易', servings: 2,
      diets: ['high-protein', 'low-carb'], allergens: ['鱼类'], utensils: ['拌碗'],
      ingredients: [ingredient('金枪鱼', '1 罐'), ingredient('玉米', '120 克'), ingredient('黄瓜', '1 根'), ingredient('生菜', '一大把', false)],
      steps: ['金枪鱼沥去多余油水，玉米沥干。', '黄瓜拍碎切块，生菜洗净擦干。', '用柠檬汁、黑胡椒、少量盐和橄榄油调汁。', '所有食材轻轻拌匀，立即食用。'],
      substitutions: ['金枪鱼可换熟鸡胸肉。', '没有生菜时用焯熟的西兰花。'],
      nutrition: { calories: 276, protein: 31, carbs: 22, fat: 8 },
    },
    {
      id: 'scallion-noodles', title: '葱油拌面', cuisine: '家常', minutes: 20, difficulty: '容易', servings: 2,
      diets: ['vegetarian', 'vegan'], allergens: ['麸质', '大豆'], utensils: ['汤锅', '小锅'],
      ingredients: [ingredient('面条', '220 克', true, ['意面']), ingredient('小葱', '5 根'), ingredient('生抽', '2 汤勺'), ingredient('白糖', '1 小勺', false)],
      steps: ['小葱切长段，葱白与葱绿分开。', '冷油下葱段，小火慢炸到焦黄后捞出。', '葱油中加入生抽、糖和一勺清水，小火煮开。', '面条煮熟沥干，趁热拌入葱油汁。'],
      substitutions: ['意面也能使用，建议选择细面型。', '不吃糖可省略，酱汁会更咸鲜。'],
      nutrition: { calories: 468, protein: 13, carbs: 75, fat: 13 },
    },
    {
      id: 'egg-fried-rice', title: '黄金蛋炒饭', cuisine: '家常', minutes: 13, difficulty: '容易', servings: 2,
      diets: ['vegetarian', 'high-protein'], allergens: ['鸡蛋', '大豆'], utensils: ['炒锅'],
      ingredients: [ingredient('米饭', '2 碗'), ingredient('鸡蛋', '3 个'), ingredient('胡萝卜', '半根', false), ingredient('小葱', '1 根', false)],
      steps: ['冷米饭拨散，鸡蛋充分打匀，配菜切小丁。', '热锅少油炒熟胡萝卜丁，推到锅边。', '倒入蛋液快速划散，半凝固时加入米饭。', '大火把饭粒炒散，加盐和少量生抽，撒葱花。'],
      substitutions: ['米饭太湿时先微波加热 1 分钟散去水汽。', '可加入玉米、青豆或切碎的剩余蔬菜。'],
      nutrition: { calories: 522, protein: 20, carbs: 75, fat: 16 },
    },
    {
      id: 'braised-tofu', title: '菌菇烧豆腐', cuisine: '家常', minutes: 30, difficulty: '中等', servings: 3,
      diets: ['vegetarian', 'vegan', 'low-carb'], allergens: ['大豆'], utensils: ['炒锅'],
      ingredients: [ingredient('豆腐', '400 克'), ingredient('蘑菇', '200 克'), ingredient('青椒', '1 个', false), ingredient('大蒜', '2 瓣')],
      steps: ['豆腐切厚片，擦干表面水分。', '少油中火把豆腐两面煎黄后盛出。', '炒香蒜末和蘑菇，加入生抽和半碗水。', '豆腐回锅烧 6 分钟，最后加入青椒收汁。'],
      substitutions: ['任何耐炒菌菇都可以混合使用。', '豆腐容易碎时先用淡盐水浸泡 5 分钟。'],
      nutrition: { calories: 248, protein: 19, carbs: 14, fat: 14 },
    },
    {
      id: 'garlic-chicken-broccoli', title: '蒜香西兰花鸡丁', cuisine: '家常', minutes: 24, difficulty: '容易', servings: 2,
      diets: ['high-protein', 'low-carb'], allergens: ['大豆'], utensils: ['炒锅'],
      ingredients: [ingredient('鸡胸肉', '280 克'), ingredient('西兰花', '260 克'), ingredient('大蒜', '4 瓣'), ingredient('胡萝卜', '半根', false)],
      steps: ['鸡胸肉切丁，加盐、生抽和少量淀粉腌 8 分钟。', '西兰花焯水 90 秒后立即沥干。', '大火炒鸡丁至表面变白，加入蒜末炒香。', '倒入西兰花快速翻匀，用黑胡椒调味。'],
      substitutions: ['鸡胸肉可换虾仁，炒制时间缩短。', '没有西兰花可换菜花。'],
      nutrition: { calories: 326, protein: 46, carbs: 18, fat: 9 },
    },
    {
      id: 'cabbage-glass-noodle', title: '包菜粉丝煲', cuisine: '家常', minutes: 26, difficulty: '容易', servings: 3,
      diets: ['vegetarian', 'vegan'], allergens: ['大豆'], utensils: ['炒锅'],
      ingredients: [ingredient('包菜', '半颗'), ingredient('粉丝', '2 把'), ingredient('大蒜', '3 瓣'), ingredient('胡萝卜', '半根', false)],
      steps: ['粉丝用温水泡软后剪短，包菜手撕成片。', '锅中炒香蒜末和胡萝卜，加入包菜大火翻炒。', '包菜变软后加入粉丝、生抽和小半碗水。', '加盖焖 3 分钟，开盖翻匀收汁。'],
      substitutions: ['包菜可换娃娃菜。', '粉丝吸水快，汤汁不足时少量多次补水。'],
      nutrition: { calories: 286, protein: 7, carbs: 52, fat: 6 },
    },
    {
      id: 'spinach-omelette', title: '菠菜芝士厚蛋', cuisine: '西式', minutes: 18, difficulty: '中等', servings: 2,
      diets: ['vegetarian', 'high-protein', 'low-carb'], allergens: ['鸡蛋', '乳制品'], utensils: ['平底锅'],
      ingredients: [ingredient('鸡蛋', '4 个'), ingredient('菠菜', '150 克'), ingredient('芝士', '40 克', false), ingredient('牛奶', '2 汤勺', false, ['清水'])],
      steps: ['菠菜焯水后挤干切碎，鸡蛋加牛奶打散。', '平底锅小火倒入一半蛋液，铺菠菜和芝士。', '蛋液半凝固时向一侧卷起，再倒入剩余蛋液。', '继续卷成厚蛋，关火静置 1 分钟后切段。'],
      substitutions: ['没有芝士可以省略，或加入切碎的蘑菇。', '牛奶可换清水，仍能保持柔软。'],
      nutrition: { calories: 336, protein: 29, carbs: 7, fat: 22 },
    },
    {
      id: 'soy-sauce-chicken', title: '电饭锅酱油鸡腿', cuisine: '粤式', minutes: 55, difficulty: '容易', servings: 3,
      diets: ['high-protein'], allergens: ['大豆'], utensils: ['电饭锅'],
      ingredients: [ingredient('鸡腿', '3 只'), ingredient('洋葱', '半个'), ingredient('姜', '5 片'), ingredient('生抽', '3 汤勺')],
      steps: ['鸡腿擦干，用生抽、少量老抽和姜片腌 20 分钟。', '电饭锅底铺洋葱，放入鸡腿和腌料。', '启动标准煮饭程序，中途翻面一次。', '程序结束后焖 8 分钟，确认最厚处熟透再切。'],
      substitutions: ['鸡腿可换鸡翅，数量按重量调整。', '没有洋葱可铺小葱段，避免鸡皮直接粘锅。'],
      nutrition: { calories: 418, protein: 42, carbs: 13, fat: 22 },
    },
  ];

  const elements = Object.fromEntries([
    'pantry-form', 'ingredient-input', 'ingredient-error', 'ingredient-chips', 'quick-list',
    'servings', 'max-minutes', 'diet', 'cuisine', 'exclude', 'source-status', 'printer-status',
    'empty-ticket', 'ticket-output', 'recipe-tabs', 'recipe-ticket', 'ticket-kicker', 'recipe-title',
    'match-stamp', 'recommend-reason', 'recipe-facts', 'favorite-button', 'shop-missing',
    'serving-note', 'recipe-ingredients', 'recipe-steps', 'substitutions-section', 'substitutions',
    'nutrition', 'shopping-list', 'shopping-empty', 'shopping-count', 'copy-shopping',
    'clear-shopping', 'saved-dialog', 'saved-list', 'saved-count', 'toast', 'live-region',
  ].map((id) => [id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), document.getElementById(id)]));

  const state = {
    ingredients: [],
    recommendations: [],
    selectedId: '',
    request: null,
    favorites: [],
    shopping: [],
    source: 'local',
    generation: 0,
  };

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    }[character]));
  }

  function announce(message) {
    elements.liveRegion.textContent = '';
    requestAnimationFrame(() => { elements.liveRegion.textContent = message; });
  }

  let toastTimer;
  function toast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2200);
  }

  function readJSON(value, fallback) {
    try { return JSON.parse(value); } catch { return fallback; }
  }

  function safeFavorite(recipe) {
    if (!recipe || typeof recipe !== 'object' || !recipe.id || !recipe.title) return null;
    if (!Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps)) return null;
    return {
      ...recipe,
      id: String(recipe.id).slice(0, 90),
      title: String(recipe.title).replace(/<[^>]*>/g, '').slice(0, 60),
      ingredients: recipe.ingredients.slice(0, 20),
      steps: recipe.steps.map((step) => String(step).replace(/<[^>]*>/g, '').slice(0, 220)).slice(0, 12),
    };
  }

  function loadState() {
    const saved = readJSON(localStorage.getItem(STORAGE_KEY), {});
    state.ingredients = Core.parseIngredients(saved.ingredients || []);
    state.shopping = Array.isArray(saved.shopping) ? saved.shopping.filter((item) => item && item.name).slice(0, 30) : [];
    state.favorites = Array.isArray(saved.favorites) ? saved.favorites.map(safeFavorite).filter(Boolean).slice(0, 12) : [];
    const settings = saved.settings && typeof saved.settings === 'object' ? saved.settings : {};
    const controls = [
      [elements.servings, settings.servings], [elements.maxMinutes, settings.maxMinutes],
      [elements.diet, settings.diet], [elements.cuisine, settings.cuisine],
    ];
    controls.forEach(([control, value]) => {
      if (value != null && [...control.options].some((option) => option.value === String(value))) control.value = String(value);
    });
    elements.exclude.value = Array.isArray(settings.exclude) ? settings.exclude.join('、') : '';
  }

  function saveState() {
    const settings = requestFromForm();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ingredients: state.ingredients,
      favorites: state.favorites,
      shopping: state.shopping,
      settings: {
        servings: settings.servings,
        maxMinutes: settings.maxMinutes,
        diet: settings.diet,
        cuisine: settings.cuisine,
        exclude: settings.exclude,
      },
    }));
  }

  function requestFromForm() {
    return Core.normalizeRequest({
      ingredients: state.ingredients,
      servings: elements.servings.value,
      maxMinutes: elements.maxMinutes.value,
      diet: elements.diet.value,
      cuisine: elements.cuisine.value,
      exclude: elements.exclude.value,
    });
  }

  function renderIngredients() {
    if (!state.ingredients.length) {
      elements.ingredientChips.innerHTML = '<span class="ingredient-placeholder">台面还是空的，先放入 2—8 种主要食材。</span>';
    } else {
      elements.ingredientChips.innerHTML = state.ingredients.map((name) => `
        <span class="ingredient-chip">
          ${escapeHTML(name)}
          <button type="button" data-remove-ingredient="${escapeHTML(name)}" aria-label="移除 ${escapeHTML(name)}">×</button>
        </span>
      `).join('');
    }
    elements.quickList.querySelectorAll('[data-ingredient]').forEach((button) => {
      button.disabled = state.ingredients.includes(Core.normalizeIngredient(button.dataset.ingredient));
    });
  }

  function addIngredients(value) {
    const next = Core.parseIngredients([...state.ingredients, ...Core.parseIngredients(value)]);
    if (next.length === state.ingredients.length) return false;
    state.ingredients = next;
    elements.ingredientError.textContent = '';
    renderIngredients();
    saveState();
    announce(`已加入食材，现在共 ${state.ingredients.length} 种。`);
    return true;
  }

  function setSource(source, label, printerLabel) {
    state.source = source;
    document.body.dataset.source = source;
    elements.sourceStatus.textContent = label;
    elements.printerStatus.textContent = printerLabel;
  }

  function selectedRecipe() {
    return state.recommendations.find((recipe) => recipe.id === state.selectedId) || state.recommendations[0] || null;
  }

  function scaleAmount(amount, fromServings, toServings) {
    const text = String(amount || '适量');
    const factor = toServings / Math.max(1, Number(fromServings) || toServings);
    if (Math.abs(factor - 1) < .01) return text;
    return text.replace(/\d+(?:\.\d+)?/, (match) => {
      const scaled = Number(match) * factor;
      return String(Math.round(scaled * 10) / 10);
    });
  }

  function renderRecipeTabs() {
    elements.recipeTabs.innerHTML = state.recommendations.map((recipe, index) => `
      <li>
        <button class="recipe-tab" type="button" role="tab" aria-selected="${recipe.id === state.selectedId}"
          data-select-recipe="${escapeHTML(recipe.id)}">
          <strong>${escapeHTML(recipe.title)}</strong>
          <span>${String(index + 1).padStart(2, '0')} · ${recipe.minutes} MIN · 匹配 ${recipe.matchPercent}%</span>
        </button>
      </li>
    `).join('');
  }

  function renderRecipeTicket() {
    const recipe = selectedRecipe();
    if (!recipe) return;
    const index = state.recommendations.findIndex((item) => item.id === recipe.id);
    const targetServings = state.request ? state.request.servings : recipe.servings;
    const favorite = state.favorites.some((item) => item.id === recipe.id);
    elements.ticketKicker.textContent = `${state.source === 'ai' ? 'AI 灵感单' : state.source === 'saved' ? '收藏夹回单' : '今晚主推'} · 订单 ${String(index + 1).padStart(2, '0')}`;
    elements.recipeTitle.textContent = recipe.title;
    elements.matchStamp.textContent = `MATCH\n${recipe.matchPercent}%`;
    elements.matchStamp.style.whiteSpace = 'pre-line';
    elements.recommendReason.textContent = recipe.reason;
    elements.recipeFacts.innerHTML = [
      `${recipe.cuisine}风味`, `${recipe.minutes} 分钟`, recipe.difficulty, `${targetServings} 人份`,
    ].map((fact) => `<span>${escapeHTML(fact)}</span>`).join('');
    elements.favoriteButton.setAttribute('aria-pressed', String(favorite));
    elements.favoriteButton.textContent = favorite ? '已收藏 · 点击移除' : '收藏这张菜谱';
    elements.shopMissing.disabled = !recipe.missing || !recipe.missing.length;
    elements.shopMissing.textContent = recipe.missing && recipe.missing.length ? `缺料加入采购夹 · ${recipe.missing.length}` : '食材齐全 · 可以开做';
    elements.servingNote.textContent = `用量按 ${targetServings} 人份估算`;

    const available = new Set((recipe.available || []).map(Core.normalizeIngredient));
    const missing = new Set((recipe.missing || []).map(Core.normalizeIngredient));
    elements.recipeIngredients.innerHTML = recipe.ingredients.map((item) => {
      const name = Core.normalizeIngredient(item.name);
      const stateClass = available.has(name) ? '' : missing.has(name) ? 'missing' : 'optional';
      const status = available.has(name) ? '已有' : missing.has(name) ? '待补' : '可选';
      return `<li><i class="ingredient-state ${stateClass}" aria-hidden="true"></i><span>${escapeHTML(item.name)} <small>· ${status}</small></span><em>${escapeHTML(scaleAmount(item.amount, recipe.servings, targetServings))}</em></li>`;
    }).join('');
    elements.recipeSteps.innerHTML = recipe.steps.map((step) => `<li>${escapeHTML(step)}</li>`).join('');
    const substitutions = Array.isArray(recipe.substitutions) ? recipe.substitutions : [];
    elements.substitutionsSection.hidden = !substitutions.length;
    elements.substitutions.innerHTML = substitutions.map((entry) => `<li>${escapeHTML(entry)}</li>`).join('');

    const nutrition = recipe.nutrition || {};
    const nutritionItems = [
      ['热量', nutrition.calories, 'kcal'], ['蛋白质', nutrition.protein, 'g'],
      ['碳水', nutrition.carbs, 'g'], ['脂肪', nutrition.fat, 'g'],
    ].filter(([, value]) => Number.isFinite(Number(value)));
    elements.nutrition.innerHTML = nutritionItems.length
      ? nutritionItems.map(([label, value, unit]) => `<div><dt>${label}</dt><dd>${Math.round(Number(value))}${unit}</dd></div>`).join('')
      : '<div><dt>暂无可靠估算</dt><dd>—</dd></div>';
  }

  function animateTicket() {
    document.body.classList.remove('ticket-arrived');
    requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.add('ticket-arrived')));
  }

  function renderRecommendations() {
    const hasRecipes = state.recommendations.length > 0;
    elements.emptyTicket.hidden = hasRecipes;
    elements.ticketOutput.hidden = !hasRecipes;
    if (!hasRecipes) return;
    if (!state.selectedId || !state.recommendations.some((recipe) => recipe.id === state.selectedId)) {
      state.selectedId = state.recommendations[0].id;
    }
    renderRecipeTabs();
    renderRecipeTicket();
    animateTicket();
  }

  function renderShopping() {
    elements.shoppingCount.textContent = state.shopping.length;
    elements.shoppingEmpty.hidden = state.shopping.length > 0;
    elements.copyShopping.disabled = state.shopping.length === 0;
    elements.clearShopping.disabled = state.shopping.length === 0;
    elements.shoppingList.innerHTML = state.shopping.map((item) => `
      <li class="${item.checked ? 'checked' : ''}">
        <input type="checkbox" data-check-shopping="${escapeHTML(item.id)}" ${item.checked ? 'checked' : ''} aria-label="已购买 ${escapeHTML(item.name)}">
        <span>${escapeHTML(item.name)}</span>
        <em>${escapeHTML(item.amount || '适量')}</em>
        <button type="button" data-remove-shopping="${escapeHTML(item.id)}" aria-label="移除 ${escapeHTML(item.name)}">×</button>
      </li>
    `).join('');
  }

  function renderSaved() {
    elements.savedCount.textContent = state.favorites.length;
    if (!state.favorites.length) {
      elements.savedList.innerHTML = '<p class="saved-empty">还没有收藏。出单后把真正想做的菜谱夹进来。</p>';
      return;
    }
    elements.savedList.innerHTML = state.favorites.map((recipe) => `
      <article class="saved-card">
        <div><strong>${escapeHTML(recipe.title)}</strong><span>${escapeHTML(recipe.cuisine)} · ${recipe.minutes} 分钟 · ${recipe.ingredients.length} 种食材</span></div>
        <div>
          <button type="button" data-open-favorite="${escapeHTML(recipe.id)}">查看</button>
          <button type="button" data-remove-favorite="${escapeHTML(recipe.id)}">移除</button>
        </div>
      </article>
    `).join('');
  }

  async function attemptAI(request, generation) {
    if (OFFLINE) {
      setSource('local', '本地配餐 · 已强制离线', '本地结果已就绪');
      return;
    }
    setSource('local', '本地结果 · 正尝试 AI', '本地先出单，等待 AI 增强');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`AI unavailable (${response.status})`);
      const payload = await response.json();
      const recipes = Core.sanitizeAIRecipes(payload, request);
      if (!recipes.length) throw new Error('AI returned no valid recipes');
      if (generation !== state.generation) return;
      state.recommendations = recipes;
      state.selectedId = recipes[0].id;
      setSource('ai', 'AI 增强 · 服务端安全连接', 'AI 灵感单已就绪');
      renderRecommendations();
      announce(`AI 已重新出单，共 ${recipes.length} 道菜。`);
    } catch {
      if (generation !== state.generation) return;
      setSource('local', '本地配餐 · AI 未连接', '本地结果已就绪');
    } finally {
      clearTimeout(timer);
    }
  }

  function generateRecommendations() {
    const request = requestFromForm();
    if (!request.ingredients.length) {
      elements.ingredientError.textContent = '至少加入一种主要食材，才能开始配餐。';
      elements.ingredientInput.focus();
      return;
    }
    elements.ingredientError.textContent = '';
    state.request = request;
    const outcome = Core.relaxAndRecommend(request, RECIPES);
    state.recommendations = outcome.recipes;
    state.selectedId = outcome.recipes[0] ? outcome.recipes[0].id : '';
    state.generation += 1;
    saveState();

    if (!outcome.recipes.length) {
      setSource('local', '本地配餐 · 没有安全结果', '请调整忌口或增加食材');
      elements.emptyTicket.querySelector('strong').textContent = '这组条件暂时无法出单';
      elements.emptyTicket.querySelector('p').textContent = '饮食偏好和忌口不会自动放宽。请增加食材，或调整最长用时后再试。';
      renderRecommendations();
      announce('没有找到满足饮食和忌口条件的菜谱。');
      return;
    }

    if (outcome.relaxed) toast(outcome.note);
    setSource('local', '本地配餐 · 随时可用', outcome.relaxed ? '已放宽时间，其他条件未变' : '本地结果已就绪');
    renderRecommendations();
    announce(`已生成 ${outcome.recipes.length} 道候选菜谱。`);
    attemptAI(request, state.generation);
  }

  function toggleFavorite() {
    const recipe = selectedRecipe();
    if (!recipe) return;
    const index = state.favorites.findIndex((item) => item.id === recipe.id);
    if (index >= 0) {
      state.favorites.splice(index, 1);
      toast('已从收藏夹移除');
    } else {
      const snapshot = safeFavorite(recipe);
      if (snapshot) state.favorites.unshift(snapshot);
      state.favorites = state.favorites.slice(0, 12);
      toast('已夹进收藏菜谱');
    }
    saveState();
    renderRecipeTicket();
    renderSaved();
  }

  function addMissingToShopping() {
    const recipe = selectedRecipe();
    if (!recipe || !recipe.missing || !recipe.missing.length) return;
    let added = 0;
    recipe.missing.forEach((name) => {
      const normalized = Core.normalizeIngredient(name);
      if (state.shopping.some((item) => item.id === normalized)) return;
      const item = recipe.ingredients.find((entry) => Core.normalizeIngredient(entry.name) === normalized);
      state.shopping.push({ id: normalized, name: item ? item.name : name, amount: item ? item.amount : '适量', checked: false });
      added += 1;
    });
    saveState();
    renderShopping();
    toast(added ? `已加入 ${added} 样缺料` : '这些缺料已在采购夹中');
  }

  async function copyShopping() {
    if (!state.shopping.length) return;
    const text = ['PANTRY/67 采购清单', ...state.shopping.map((item) => `${item.checked ? '☑' : '☐'} ${item.name} ${item.amount || ''}`)].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast('采购清单已复制');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      toast('采购清单已复制');
    }
  }

  document.getElementById('add-ingredient').addEventListener('click', () => {
    if (addIngredients(elements.ingredientInput.value)) elements.ingredientInput.value = '';
  });
  elements.ingredientInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (addIngredients(elements.ingredientInput.value)) elements.ingredientInput.value = '';
  });
  elements.ingredientChips.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-ingredient]');
    if (!button) return;
    state.ingredients = state.ingredients.filter((name) => name !== button.dataset.removeIngredient);
    renderIngredients();
    saveState();
  });
  elements.quickList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-ingredient]');
    if (button) addIngredients(button.dataset.ingredient);
  });
  document.getElementById('load-sample').addEventListener('click', () => {
    state.ingredients = Core.parseIngredients('番茄、鸡蛋、剩米饭、蘑菇、西兰花、鸡胸肉');
    renderIngredients();
    saveState();
    toast('已装入一份示例冰箱');
  });
  document.getElementById('clear-pantry').addEventListener('click', () => {
    state.ingredients = [];
    renderIngredients();
    saveState();
    elements.ingredientInput.focus();
  });
  elements.pantryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    generateRecommendations();
  });
  elements.recipeTabs.addEventListener('click', (event) => {
    const button = event.target.closest('[data-select-recipe]');
    if (!button) return;
    state.selectedId = button.dataset.selectRecipe;
    renderRecipeTabs();
    renderRecipeTicket();
    animateTicket();
  });
  elements.favoriteButton.addEventListener('click', toggleFavorite);
  elements.shopMissing.addEventListener('click', addMissingToShopping);
  elements.shoppingList.addEventListener('change', (event) => {
    const input = event.target.closest('[data-check-shopping]');
    if (!input) return;
    const item = state.shopping.find((entry) => entry.id === input.dataset.checkShopping);
    if (item) item.checked = input.checked;
    saveState();
    renderShopping();
  });
  elements.shoppingList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-shopping]');
    if (!button) return;
    state.shopping = state.shopping.filter((item) => item.id !== button.dataset.removeShopping);
    saveState();
    renderShopping();
  });
  elements.copyShopping.addEventListener('click', copyShopping);
  elements.clearShopping.addEventListener('click', () => {
    state.shopping = [];
    saveState();
    renderShopping();
  });
  document.getElementById('open-saved').addEventListener('click', () => {
    renderSaved();
    elements.savedDialog.showModal();
  });
  document.getElementById('close-saved').addEventListener('click', () => elements.savedDialog.close());
  elements.savedDialog.addEventListener('click', (event) => {
    if (event.target === elements.savedDialog) elements.savedDialog.close();
    const open = event.target.closest('[data-open-favorite]');
    if (open) {
      const recipe = state.favorites.find((item) => item.id === open.dataset.openFavorite);
      if (!recipe) return;
      state.recommendations = [recipe];
      state.selectedId = recipe.id;
      state.request = requestFromForm();
      setSource('saved', '收藏菜谱 · 本机保存', '收藏菜谱已回单');
      renderRecommendations();
      elements.savedDialog.close();
      document.getElementById('printer-title').scrollIntoView({ behavior: 'smooth' });
    }
    const remove = event.target.closest('[data-remove-favorite]');
    if (remove) {
      state.favorites = state.favorites.filter((item) => item.id !== remove.dataset.removeFavorite);
      saveState();
      renderSaved();
      if (state.selectedId === remove.dataset.removeFavorite) renderRecipeTicket();
    }
  });
  [elements.servings, elements.maxMinutes, elements.diet, elements.cuisine, elements.exclude].forEach((control) => {
    control.addEventListener('change', saveState);
  });

  loadState();
  renderIngredients();
  renderShopping();
  renderSaved();
  if (OFFLINE) setSource('local', '本地配餐 · 已强制离线', '等待食材');
  document.body.classList.add('ready');
}());
