// Built-in nutrition database. Values are per 100 g (or 100 ml for drinks), approximate
// reference figures drawn from IFCT 2017 (India) and USDA FoodData Central for dishes as
// commonly cooked at home. Units map household portions to grams.
import extraRows from './foods-extra.json';

export type Category = 'Food' | 'Drink' | 'Dessert' | 'Other';
export type Diet = 'veg' | 'egg' | 'nonveg';
export type Nutrients = { kcal: number; carb: number; protein: number; fat: number; fibre: number; sugar: number };
export type Unit = { id: string; label: string; grams: number };

export type Food = {
  id: string;
  name: string;
  aliases: string;
  cat: Category;
  icon: string;
  diet: Diet;
  base: 'g' | 'ml';
  n: Nutrients;
  gi: number | null;
  units: Unit[];
  /** Created by the user on this phone. */
  custom?: boolean;
  /** Where the values come from, for the open datasets (see README, "Food data"). */
  src?: 'indb' | 'usda';
};

type Row = [
  id: string,
  name: string,
  cat: Category,
  icon: string,
  diet: Diet,
  n: [number, number, number, number, number, number],
  gi: number | null,
  units: [string, number][],
  aliases?: string,
  base?: 'g' | 'ml',
];

const ROWS: Row[] = [
  // Grains and breads
  ['rice', 'White rice, cooked', 'Food', 'rice', 'veg', [130, 28.2, 2.7, 0.3, 0.4, 0.1], 73, [['katori', 150], ['cup', 160], ['plate', 250]], 'chawal basmati steamed plain'],
  ['brown-rice', 'Brown rice, cooked', 'Food', 'rice', 'veg', [123, 25.6, 2.7, 1, 1.6, 0.4], 68, [['katori', 150], ['cup', 160]], 'brown chawal'],
  ['jeera-rice', 'Jeera rice', 'Food', 'rice', 'veg', [150, 26, 3, 3.8, 0.8, 0.3], null, [['katori', 150], ['plate', 250]], 'cumin rice'],
  ['veg-pulao', 'Veg pulao', 'Food', 'rice', 'veg', [145, 24, 3.2, 4, 1.5, 1.2], null, [['plate', 200], ['katori', 150]], 'pulav pilaf'],
  ['chicken-biryani', 'Chicken biryani', 'Food', 'rice', 'nonveg', [170, 20, 9, 6, 1, 1], null, [['plate', 300], ['katori', 150]], 'biriyani murgh'],
  ['veg-biryani', 'Veg biryani', 'Food', 'rice', 'veg', [150, 22, 3.5, 5, 2, 1.5], null, [['plate', 300], ['katori', 150]], 'biriyani vegetable'],
  ['khichdi', 'Khichdi', 'Food', 'pot-steam', 'veg', [120, 19, 4.5, 3, 2.2, 0.8], null, [['katori', 200], ['plate', 300]], 'khichri dal rice'],
  ['chapati', 'Chapati (roti)', 'Food', 'circle-slice-8', 'veg', [264, 46.4, 8.7, 4.5, 4.9, 1.5], 62, [['roti', 40]], 'roti phulka fulka wheat'],
  ['paratha', 'Plain paratha', 'Food', 'circle-slice-8', 'veg', [300, 43, 6.5, 11, 4, 1.5], null, [['piece', 80]], 'parantha'],
  ['aloo-paratha', 'Aloo paratha', 'Food', 'circle-slice-8', 'veg', [258, 36, 6, 10, 3.5, 1.5], null, [['piece', 110]], 'potato paratha parantha'],
  ['thepla', 'Methi thepla', 'Food', 'circle-slice-8', 'veg', [280, 38, 7, 11, 5, 1.2], null, [['piece', 50]], 'thepla fenugreek'],
  ['naan', 'Naan', 'Food', 'baguette', 'veg', [290, 50, 9, 5.5, 2.2, 3.5], 71, [['piece', 90]], 'nan butter naan'],
  ['bhatura', 'Bhatura', 'Food', 'baguette', 'veg', [330, 45, 7, 14, 2, 2], null, [['piece', 80]], 'bhature'],
  ['puri', 'Puri', 'Food', 'circle-slice-8', 'veg', [340, 42, 6, 17, 2.8, 1], null, [['piece', 25]], 'poori'],
  ['idli', 'Idli', 'Food', 'circle-double', 'veg', [134, 28, 4.4, 0.5, 1.5, 0.3], 69, [['piece', 40]], 'idly'],
  ['dosa', 'Plain dosa', 'Food', 'food-croissant', 'veg', [165, 29, 3.9, 3.7, 1, 0.5], 77, [['piece', 120]], 'dosai sada'],
  ['masala-dosa', 'Masala dosa', 'Food', 'food-croissant', 'veg', [185, 25, 4, 8, 2, 1.5], null, [['piece', 180]], 'dosai potato'],
  ['uttapam', 'Uttapam', 'Food', 'circle-slice-8', 'veg', [165, 26, 4.5, 4.5, 2, 1.2], null, [['piece', 150]], 'uthappam'],
  ['medu-vada', 'Medu vada', 'Food', 'circle-outline', 'veg', [290, 28, 9, 16, 4, 1], null, [['piece', 45]], 'vada wada urad'],
  ['upma', 'Upma', 'Food', 'bowl-mix', 'veg', [140, 20, 3.5, 5, 1.8, 1.2], null, [['bowl', 180], ['katori', 150]], 'uppittu rava suji'],
  ['poha', 'Poha', 'Food', 'bowl-mix', 'veg', [158, 27, 3, 4.2, 1.2, 1.5], 64, [['plate', 180], ['katori', 150]], 'pohe flattened rice aval'],
  ['dhokla', 'Dhokla', 'Food', 'square-rounded', 'veg', [160, 22, 7, 5, 2, 4], null, [['piece', 30]], 'khaman'],
  ['oats', 'Oats porridge', 'Food', 'bowl-mix', 'veg', [71, 12, 2.5, 1.5, 1.7, 0.3], 55, [['bowl', 240]], 'oatmeal daliya'],
  ['cornflakes', 'Cornflakes, dry', 'Food', 'bowl-mix', 'veg', [357, 84, 7.5, 0.4, 3.3, 10], 81, [['bowl', 30]], 'cereal corn flakes'],
  ['muesli', 'Muesli', 'Food', 'bowl-mix', 'veg', [360, 66, 10, 6, 7, 20], 57, [['bowl', 45]], 'granola'],
  ['white-bread', 'White bread', 'Food', 'bread-slice', 'veg', [265, 49, 9, 3.2, 2.7, 5], 75, [['slice', 25]], 'bread toast pav'],
  ['brown-bread', 'Wholemeal bread', 'Food', 'bread-slice', 'veg', [247, 41, 13, 3.4, 7, 6], 69, [['slice', 38]], 'brown bread atta bread toast'],
  ['spaghetti', 'Pasta, cooked', 'Food', 'pasta', 'veg', [158, 31, 5.8, 0.9, 1.8, 0.6], 49, [['plate', 200], ['cup', 140]], 'spaghetti penne macaroni'],
  ['noodles', 'Instant noodles, cooked', 'Food', 'noodles', 'veg', [138, 19, 3, 5.5, 1, 0.5], 47, [['packet', 250]], 'maggi ramen'],
  ['sandwich', 'Vegetable sandwich', 'Food', 'food-variant', 'veg', [220, 30, 7, 8, 3, 4], null, [['piece', 150]], 'sandwich grilled'],

  // Dals and curries
  ['dal', 'Dal tadka', 'Food', 'pot-steam', 'veg', [130, 16, 7, 4.5, 4, 1.5], 32, [['katori', 150], ['bowl', 200]], 'dal daal toor arhar moong yellow lentils'],
  ['dal-makhani', 'Dal makhani', 'Food', 'pot-steam', 'veg', [170, 15, 6.5, 9.5, 5, 2], null, [['katori', 150]], 'daal makhni black dal urad'],
  ['rajma', 'Rajma curry', 'Food', 'pot-steam', 'veg', [140, 19, 6.5, 4, 5.5, 1.5], 24, [['katori', 150]], 'kidney beans rajmah'],
  ['chole', 'Chole (chickpea curry)', 'Food', 'pot-steam', 'veg', [180, 20, 7, 8, 6, 3], 28, [['katori', 150]], 'chana masala chickpeas chhole'],
  ['sambar', 'Sambar', 'Food', 'pot-steam', 'veg', [75, 10, 3.5, 2.5, 2.5, 2], null, [['katori', 150]], 'sambhar'],
  ['rasam', 'Rasam', 'Food', 'pot-steam', 'veg', [35, 5, 1, 1.2, 0.8, 1.5], null, [['bowl', 150]], 'saaru'],
  ['kadhi', 'Kadhi', 'Food', 'pot-steam', 'veg', [90, 8, 3.5, 5, 0.8, 3], null, [['katori', 150]], 'kadi pakoda'],
  ['palak-paneer', 'Palak paneer', 'Food', 'pot-steam', 'veg', [170, 6, 8, 13, 2.5, 2], null, [['katori', 150]], 'saag paneer spinach'],
  ['paneer-butter-masala', 'Paneer butter masala', 'Food', 'pot-steam', 'veg', [230, 9, 9, 18, 1.5, 5], null, [['katori', 150]], 'paneer makhani shahi paneer'],
  ['paneer', 'Paneer', 'Food', 'cheese', 'veg', [293, 3.6, 18.3, 22.9, 0, 2.6], null, [['serving', 80], ['cube', 20]], 'cottage cheese'],
  ['paneer-tikka', 'Paneer tikka', 'Food', 'cheese', 'veg', [220, 6, 16, 15, 1.5, 3], null, [['plate', 150], ['piece', 30]], 'tikka'],
  ['aloo-gobi', 'Aloo gobi', 'Food', 'bowl-mix', 'veg', [110, 12, 2.5, 6, 3, 3], null, [['katori', 150]], 'cauliflower potato sabzi'],
  ['bhindi', 'Bhindi sabzi', 'Food', 'bowl-mix', 'veg', [120, 9, 2.5, 8.5, 4, 2.5], null, [['katori', 150]], 'okra ladyfinger bhindi masala'],
  ['mix-veg', 'Mixed vegetable sabzi', 'Food', 'bowl-mix', 'veg', [100, 10, 2.5, 5.5, 3.5, 3.5], null, [['katori', 150]], 'sabji subzi vegetables'],
  ['aloo-sabzi', 'Aloo sabzi', 'Food', 'bowl-mix', 'veg', [130, 16, 2, 6.5, 2, 1.5], null, [['katori', 150]], 'potato curry'],
  ['baingan-bharta', 'Baingan bharta', 'Food', 'bowl-mix', 'veg', [100, 8, 2, 7, 4, 4], null, [['katori', 150]], 'brinjal eggplant'],
  ['chicken-curry', 'Chicken curry', 'Food', 'food-drumstick', 'nonveg', [165, 4, 15, 10, 1, 2], null, [['katori', 150]], 'murgh chicken masala'],
  ['butter-chicken', 'Butter chicken', 'Food', 'food-drumstick', 'nonveg', [215, 7, 14, 15, 1, 4.5], null, [['katori', 150]], 'murgh makhani'],
  ['chicken-tikka', 'Chicken tikka', 'Food', 'food-drumstick', 'nonveg', [150, 3, 25, 4.5, 0.5, 1.5], null, [['plate', 150], ['piece', 30]], 'tikka kebab'],
  ['tandoori-chicken', 'Tandoori chicken', 'Food', 'food-drumstick', 'nonveg', [150, 2, 23, 6, 0.5, 1], null, [['leg piece', 120]], 'tandoori'],
  ['chicken-breast', 'Grilled chicken breast', 'Food', 'food-drumstick', 'nonveg', [165, 0, 31, 3.6, 0, 0], null, [['piece', 120]], 'chicken breast grilled'],
  ['egg-curry', 'Egg curry', 'Food', 'egg', 'egg', [150, 5, 9.5, 10.5, 1, 2.5], null, [['katori', 150]], 'anda curry'],
  ['boiled-egg', 'Boiled egg', 'Food', 'egg', 'egg', [155, 1.1, 12.6, 10.6, 0, 1.1], null, [['egg', 50]], 'anda egg'],
  ['omelette', 'Omelette (2 eggs)', 'Food', 'egg-fried', 'egg', [154, 1.5, 10.5, 11.5, 0.2, 1], null, [['piece', 120]], 'omelet anda'],
  ['egg-bhurji', 'Egg bhurji', 'Food', 'egg-fried', 'egg', [185, 3, 11, 14, 0.6, 1.5], null, [['plate', 120]], 'scrambled eggs anda bhurji'],
  ['fish-curry', 'Fish curry', 'Food', 'fish', 'nonveg', [140, 4, 15, 7, 0.8, 1.5], null, [['katori', 150]], 'machli fish'],
  ['fried-fish', 'Fried fish', 'Food', 'fish', 'nonveg', [230, 8, 20, 13, 0.5, 0.3], null, [['piece', 100]], 'fish fry'],
  ['mutton-curry', 'Mutton curry', 'Food', 'food-steak', 'nonveg', [220, 4, 17, 15, 1, 2], null, [['katori', 150]], 'lamb goat gosht rogan josh'],
  ['prawn-curry', 'Prawn curry', 'Food', 'fish', 'nonveg', [120, 4, 15, 5, 0.7, 1.5], null, [['katori', 150]], 'shrimp jhinga'],
  ['salmon', 'Salmon, cooked', 'Food', 'fish', 'nonveg', [208, 0, 20, 13, 0, 0], null, [['fillet', 150]], 'fish'],

  // Snacks and fast food
  ['samosa', 'Samosa', 'Food', 'triangle', 'veg', [305, 32, 5, 17.5, 2.8, 2], null, [['piece', 60]], 'samosa'],
  ['pakora', 'Pakora', 'Food', 'circle-outline', 'veg', [315, 30, 7, 19, 4, 3], null, [['piece', 20], ['plate', 100]], 'bhajiya bhaji pakoda fritters'],
  ['pav-bhaji', 'Pav bhaji', 'Food', 'food-variant', 'veg', [180, 23, 4.5, 8, 3.5, 4], null, [['plate', 250]], 'pav bhaji'],
  ['vada-pav', 'Vada pav', 'Food', 'hamburger', 'veg', [290, 38, 6, 12, 3, 3], null, [['piece', 150]], 'wada pav'],
  ['pani-puri', 'Pani puri', 'Food', 'circle-outline', 'veg', [160, 27, 3.5, 4.5, 2.5, 4], null, [['plate of 6', 90]], 'golgappa puchka'],
  ['bhel-puri', 'Bhel puri', 'Food', 'bowl-mix', 'veg', [170, 28, 4.5, 5, 3, 4], null, [['plate', 150]], 'bhel'],
  ['kachori', 'Kachori', 'Food', 'circle-outline', 'veg', [400, 40, 8, 23, 4, 2], null, [['piece', 60]], 'kachodi'],
  ['khakhra', 'Khakhra', 'Food', 'circle-slice-8', 'veg', [390, 62, 12, 10, 8, 2], null, [['piece', 20]], 'khakra'],
  ['roasted-chana', 'Roasted chana', 'Food', 'seed', 'veg', [364, 58, 22, 5, 17, 10], 28, [['handful', 30]], 'chickpeas roasted bengal gram'],
  ['makhana', 'Roasted makhana', 'Food', 'seed', 'veg', [350, 77, 9.7, 0.1, 14.5, 0], null, [['cup', 15]], 'fox nuts lotus seeds'],
  ['bhujia', 'Namkeen (bhujia)', 'Food', 'seed', 'veg', [540, 40, 12, 37, 6, 2], null, [['handful', 30]], 'mixture sev namkin'],
  ['chips', 'Potato chips', 'Food', 'french-fries', 'veg', [536, 53, 6.6, 34, 4.4, 0.5], 56, [['small packet', 50]], 'wafers crisps lays'],
  ['biscuit', 'Marie biscuit', 'Food', 'cookie', 'veg', [440, 74, 7.5, 13, 2, 22], null, [['biscuit', 7]], 'cookies biscuits'],
  ['fries', 'French fries', 'Food', 'french-fries', 'veg', [312, 41, 3.4, 15, 3.8, 0.3], 63, [['medium', 117]], 'fries finger chips'],
  ['pizza', 'Margherita pizza', 'Food', 'pizza', 'veg', [266, 33, 11, 10, 2.3, 3.6], 60, [['slice', 107]], 'pizza'],
  ['burger', 'Burger', 'Food', 'hamburger', 'nonveg', [256, 24, 13, 12, 1.2, 5], null, [['piece', 220]], 'hamburger'],
  ['veg-momos', 'Veg momos, steamed', 'Food', 'circle-double', 'veg', [170, 26, 5, 5, 2, 1.5], null, [['piece', 30], ['plate of 6', 180]], 'dumplings momo'],
  ['chicken-momos', 'Chicken momos, steamed', 'Food', 'circle-double', 'nonveg', [190, 22, 10, 7, 1.5, 1.2], null, [['piece', 30], ['plate of 6', 180]], 'dumplings momo'],

  // Fruit and vegetables
  ['apple', 'Apple', 'Food', 'food-apple', 'veg', [52, 13.8, 0.3, 0.2, 2.4, 10.4], 36, [['medium', 182]], 'seb fruit'],
  ['banana', 'Banana', 'Food', 'fruit-pineapple', 'veg', [89, 22.8, 1.1, 0.3, 2.6, 12.2], 51, [['medium', 118]], 'kela fruit'],
  ['mango', 'Mango', 'Food', 'fruit-cherries', 'veg', [60, 15, 0.8, 0.4, 1.6, 13.7], 51, [['cup sliced', 165], ['whole', 250]], 'aam fruit'],
  ['orange', 'Orange', 'Food', 'fruit-citrus', 'veg', [47, 11.8, 0.9, 0.1, 2.4, 9.4], 43, [['medium', 130]], 'santra narangi fruit'],
  ['papaya', 'Papaya', 'Food', 'fruit-watermelon', 'veg', [43, 10.8, 0.5, 0.3, 1.7, 7.8], 60, [['cup', 145]], 'papita fruit'],
  ['watermelon', 'Watermelon', 'Food', 'fruit-watermelon', 'veg', [30, 7.6, 0.6, 0.2, 0.4, 6.2], 72, [['cup', 150], ['wedge', 280]], 'tarbooz fruit'],
  ['grapes', 'Grapes', 'Food', 'fruit-grapes', 'veg', [69, 18.1, 0.7, 0.2, 0.9, 15.5], 53, [['cup', 150]], 'angoor fruit'],
  ['pomegranate', 'Pomegranate', 'Food', 'fruit-cherries', 'veg', [83, 18.7, 1.7, 1.2, 4, 13.7], null, [['cup seeds', 87]], 'anar fruit'],
  ['guava', 'Guava', 'Food', 'fruit-pear', 'veg', [68, 14.3, 2.6, 1, 5.4, 8.9], null, [['medium', 100]], 'amrood peru fruit'],
  ['pineapple', 'Pineapple', 'Food', 'fruit-pineapple', 'veg', [50, 13.1, 0.5, 0.1, 1.4, 9.9], 59, [['cup', 165]], 'ananas fruit'],
  ['chikoo', 'Chikoo (sapota)', 'Food', 'fruit-pear', 'veg', [83, 20, 0.4, 1.1, 5.3, 14], null, [['medium', 100]], 'sapodilla chiku fruit'],
  ['dates', 'Dates', 'Food', 'seed', 'veg', [282, 75, 2.5, 0.4, 8, 63], 42, [['piece', 8]], 'khajur fruit'],
  ['salad', 'Green salad', 'Food', 'leaf', 'veg', [17, 3.3, 1.2, 0.2, 2.1, 1.3], null, [['bowl', 150]], 'salad lettuce cucumber tomato'],
  ['cucumber', 'Cucumber', 'Food', 'leaf', 'veg', [15, 3.6, 0.7, 0.1, 0.5, 1.7], null, [['medium', 200]], 'kheera kakdi'],
  ['sprouts', 'Moong sprouts', 'Food', 'sprout', 'veg', [30, 5.9, 3, 0.2, 1.8, 4.1], null, [['bowl', 100]], 'sprouts salad moong'],
  ['potato', 'Potato, boiled', 'Food', 'circle', 'veg', [87, 20.1, 1.9, 0.1, 1.8, 0.9], 78, [['medium', 150]], 'aloo'],
  ['sweet-potato', 'Sweet potato, baked', 'Food', 'circle', 'veg', [90, 20.7, 2, 0.2, 3.3, 6.5], 61, [['medium', 130]], 'shakarkandi'],
  ['broccoli', 'Broccoli, steamed', 'Food', 'leaf', 'veg', [35, 7.2, 2.4, 0.4, 3.3, 1.4], 15, [['cup', 90]], 'vegetable greens'],

  // Dairy, protein, fats
  ['curd', 'Curd (dahi)', 'Food', 'bowl', 'veg', [61, 4.7, 3.1, 3.3, 0, 4.7], 36, [['katori', 150]], 'dahi yoghurt yogurt'],
  ['greek-yogurt', 'Greek yoghurt, plain', 'Food', 'bowl', 'veg', [59, 3.6, 10.2, 0.4, 0, 3.2], 11, [['pot', 170]], 'yogurt hung curd'],
  ['raita', 'Raita', 'Food', 'bowl', 'veg', [70, 5.5, 3, 4, 0.5, 4], null, [['katori', 150]], 'boondi raita cucumber'],
  ['cheese', 'Cheese slice', 'Other', 'cheese', 'veg', [316, 4, 19, 25, 0, 3], null, [['slice', 20]], 'processed cheese'],
  ['tofu', 'Tofu, firm', 'Food', 'cheese', 'veg', [76, 1.9, 8, 4.8, 0.3, 0.6], null, [['serving', 100]], 'soy paneer'],
  ['soya-chunks', 'Soya chunks, dry', 'Other', 'seed', 'veg', [345, 33, 52, 0.5, 13, 7], null, [['handful', 30]], 'nutrela meal maker soy'],
  ['whey', 'Whey protein powder', 'Other', 'blender', 'veg', [390, 8, 78, 6, 0, 5], null, [['scoop', 30]], 'protein shake powder'],
  ['peanut-butter', 'Peanut butter', 'Other', 'peanut', 'veg', [588, 20, 25, 50, 6, 9], 14, [['tbsp', 16]], 'pb'],
  ['almonds', 'Almonds', 'Other', 'peanut', 'veg', [579, 21.6, 21.2, 49.9, 12.5, 4.4], null, [['handful', 28], ['piece', 1.2]], 'badam nuts'],
  ['walnuts', 'Walnuts', 'Other', 'peanut', 'veg', [654, 13.7, 15.2, 65.2, 6.7, 2.6], null, [['handful', 28]], 'akhrot nuts'],
  ['peanuts', 'Peanuts, roasted', 'Other', 'peanut', 'veg', [585, 21, 24, 50, 8.4, 4.2], 14, [['handful', 30]], 'moongphali groundnuts'],
  ['ghee', 'Ghee', 'Other', 'water', 'veg', [900, 0, 0, 100, 0, 0], null, [['tsp', 5], ['tbsp', 14]], 'clarified butter'],
  ['butter', 'Butter', 'Other', 'water', 'veg', [717, 0.1, 0.9, 81, 0, 0.1], null, [['tsp', 5]], 'makhan'],
  ['honey', 'Honey', 'Other', 'beehive-outline', 'veg', [304, 82.4, 0.3, 0, 0.2, 82.1], 58, [['tsp', 7], ['tbsp', 21]], 'shahad'],
  ['sugar', 'Sugar', 'Other', 'cube-outline', 'veg', [387, 100, 0, 0, 0, 100], 65, [['tsp', 4]], 'cheeni shakkar'],

  // Drinks (per 100 ml)
  ['chai', 'Masala chai', 'Drink', 'tea', 'veg', [51, 7.5, 1.6, 1.6, 0, 7], null, [['cup', 150]], 'tea chai milk sugar', 'ml'],
  ['chai-nosugar', 'Tea with milk, no sugar', 'Drink', 'tea', 'veg', [25, 2.2, 1.4, 1.3, 0, 2.2], null, [['cup', 150]], 'chai tea sugar free', 'ml'],
  ['filter-coffee', 'Filter coffee', 'Drink', 'coffee', 'veg', [60, 8, 1.8, 2.2, 0, 7.5], null, [['cup', 150]], 'coffee milk kaapi', 'ml'],
  ['black-coffee', 'Black coffee', 'Drink', 'coffee', 'veg', [2, 0, 0.3, 0, 0, 0], null, [['cup', 240]], 'americano espresso', 'ml'],
  ['green-tea', 'Green tea', 'Drink', 'tea', 'veg', [1, 0.2, 0, 0, 0, 0], null, [['cup', 240]], 'tea', 'ml'],
  ['milk', 'Whole milk', 'Drink', 'glass-mug-variant', 'veg', [61, 4.8, 3.2, 3.3, 0, 5.1], 39, [['glass', 250], ['cup', 150]], 'doodh full cream', 'ml'],
  ['toned-milk', 'Toned milk', 'Drink', 'glass-mug-variant', 'veg', [58, 4.7, 3.1, 3, 0, 4.7], 37, [['glass', 250], ['cup', 150]], 'doodh', 'ml'],
  ['buttermilk', 'Buttermilk (chaas)', 'Drink', 'cup', 'veg', [25, 3, 1.5, 0.8, 0, 3], null, [['glass', 250]], 'chaas mattha majjige', 'ml'],
  ['lassi', 'Sweet lassi', 'Drink', 'cup', 'veg', [98, 15, 3, 3, 0, 14], null, [['glass', 250]], 'lassi', 'ml'],
  ['orange-juice', 'Orange juice', 'Drink', 'cup', 'veg', [45, 10.4, 0.7, 0.2, 0.2, 8.4], 50, [['glass', 250]], 'juice', 'ml'],
  ['sugarcane', 'Sugarcane juice', 'Drink', 'cup', 'veg', [72, 18, 0.2, 0, 0, 17], null, [['glass', 250]], 'ganne ka ras', 'ml'],
  ['coconut-water', 'Coconut water', 'Drink', 'cup-water', 'veg', [19, 3.7, 0.7, 0.2, 1.1, 2.6], 55, [['coconut', 300], ['glass', 250]], 'nariyal pani', 'ml'],
  ['nimbu-pani', 'Nimbu pani', 'Drink', 'cup-water', 'veg', [30, 7.5, 0.1, 0, 0.1, 7], null, [['glass', 250]], 'lemonade shikanji lemon water', 'ml'],
  ['banana-shake', 'Banana milkshake', 'Drink', 'blender', 'veg', [90, 15, 3, 2.3, 0.6, 12], null, [['glass', 300]], 'shake smoothie', 'ml'],
  ['cola', 'Cola', 'Drink', 'bottle-soda', 'veg', [42, 10.6, 0, 0, 0, 10.6], 63, [['can', 330], ['glass', 250]], 'coke pepsi soft drink soda', 'ml'],
  ['beer', 'Beer', 'Drink', 'glass-mug', 'veg', [43, 3.6, 0.5, 0, 0, 0], null, [['bottle', 330], ['pint', 500]], 'lager', 'ml'],

  // Desserts
  ['gulab-jamun', 'Gulab jamun', 'Dessert', 'circle', 'veg', [332, 50, 5, 12.5, 0.5, 40], null, [['piece', 40]], 'mithai sweet'],
  ['rasgulla', 'Rasgulla', 'Dessert', 'circle-outline', 'veg', [186, 40, 4, 1.8, 0, 34], null, [['piece', 50]], 'rasogolla mithai'],
  ['jalebi', 'Jalebi', 'Dessert', 'candy', 'veg', [385, 60, 2.5, 15, 0.5, 45], null, [['piece', 25]], 'jilebi mithai'],
  ['kheer', 'Rice kheer', 'Dessert', 'bowl', 'veg', [149, 22, 4, 5, 0.2, 15], null, [['katori', 150]], 'payasam rice pudding'],
  ['sooji-halwa', 'Sooji halwa', 'Dessert', 'bowl', 'veg', [330, 45, 4, 15, 1, 28], null, [['katori', 100]], 'sheera rava halwa'],
  ['gajar-halwa', 'Gajar halwa', 'Dessert', 'bowl', 'veg', [250, 32, 5, 11, 2, 26], null, [['katori', 150]], 'carrot halwa'],
  ['besan-ladoo', 'Besan ladoo', 'Dessert', 'circle', 'veg', [480, 55, 9, 25, 3, 35], null, [['piece', 40]], 'laddu mithai'],
  ['barfi', 'Barfi', 'Dessert', 'square-rounded', 'veg', [400, 55, 8, 17, 0.5, 50], null, [['piece', 30]], 'burfi kaju katli mithai'],
  ['cake', 'Chocolate cake', 'Dessert', 'cake-variant', 'egg', [371, 53, 5, 16, 2, 36], 38, [['slice', 95]], 'cake pastry'],
  ['ice-cream', 'Vanilla ice cream', 'Dessert', 'ice-cream', 'veg', [207, 23.6, 3.5, 11, 0.7, 21.2], 57, [['scoop', 66], ['cup', 100]], 'icecream kulfi'],
  ['dark-chocolate', 'Dark chocolate 70%', 'Dessert', 'square-rounded', 'veg', [598, 45.9, 7.8, 42.6, 10.9, 24], 23, [['square', 10]], 'chocolate'],
  ['milk-chocolate', 'Milk chocolate', 'Dessert', 'square-rounded', 'veg', [535, 59, 7.6, 30, 3.4, 52], 43, [['square', 10], ['bar', 40]], 'chocolate dairy milk'],
];

function toFood(r: Row): Food {
  const [id, name, cat, icon, diet, n, gi, units, aliases = '', base = 'g'] = r;
  const unitList: Unit[] = units.map(([label, grams]) => ({ id: label, label, grams }));
  unitList.push({ id: base, label: base === 'ml' ? 'ml' : 'gram', grams: 1 });
  return {
    id,
    name,
    aliases,
    cat,
    icon,
    diet,
    base,
    gi,
    n: { kcal: n[0], carb: n[1], protein: n[2], fat: n[3], fibre: n[4], sugar: n[5] },
    units: unitList,
  };
}

export const FOODS: Food[] = ROWS.map(toFood);
/**
 * About 6,000 more foods from open datasets, generated by scripts/foods/build_foods.py:
 * Indian recipes from the Indian Nutrient Databank (INDB, CC BY 4.0) and foods as eaten
 * from USDA FoodData Central (FNDDS, public domain). The curated list above is searched first.
 */
type ExtraRow = [
  id: string,
  name: string,
  cat: Category,
  icon: string,
  diet: Diet,
  n: [number, number, number, number, number, number],
  units: [string, number][],
  base: 'g' | 'ml',
  src: 'indb' | 'usda',
  alias?: string,
];

function extraFood(r: ExtraRow): Food {
  const [id, name, cat, icon, diet, n, units, base, src, alias = ''] = r;
  return {
    id,
    name,
    aliases: alias,
    cat,
    icon,
    diet,
    base,
    gi: null,
    src,
    n: { kcal: n[0], carb: n[1], protein: n[2], fat: n[3], fibre: n[4], sugar: n[5] },
    units: [...units.map(([label, grams]) => ({ id: label, label, grams })), { id: base, label: base === 'ml' ? 'ml' : 'gram', grams: 1 }],
  };
}

/**
 * The portion a food is shown and quick-added with: its first household unit, or 100 g / 100 ml
 * when it only has a weight (never "1 gram").
 */
export function defaultPortion(f: Food): { unit: Unit; qty: number; grams: number; label: string } {
  const unit = f.units[0];
  const byWeight = unit.grams === 1;
  const qty = byWeight ? 100 : 1;
  return { unit, qty, grams: unit.grams * qty, label: byWeight ? `100 ${f.base}` : `1 ${unit.label}` };
}

export const EXTRA_FOODS: Food[] = (extraRows as unknown as ExtraRow[]).map(extraFood);
export const ALL_FOODS: Food[] = [...FOODS, ...EXTRA_FOODS];
export const FOOD_BY_ID: Record<string, Food> = Object.fromEntries(ALL_FOODS.map((f) => [f.id, f]));

export const CATEGORY_TINT: Record<Category, string> = {
  Food: '#FBEFD8',
  Drink: '#DDEEF6',
  Dessert: '#F8E1EA',
  Other: '#E8EBD8',
};
