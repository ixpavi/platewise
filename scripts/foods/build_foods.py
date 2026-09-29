"""Builds src/data/foods-extra.json from two open datasets.

  * Indian Nutrient Databank (INDB): 1,014 Indian recipes, per 100 g and per serving.
    Vijayakumar A, et al. "Development of an Indian Food Composition Database."
    Current Developments in Nutrition, 2024 (CC BY 4.0). Files:
    https://github.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-
  * USDA FoodData Central, Food and Nutrient Database for Dietary Studies (FNDDS, survey foods),
    foods "as eaten" with household portions. Public domain (CC0).
    https://fdc.nal.usda.gov/download-datasets

Vegetarian / egg / non-vegetarian is decided from each dish's ingredient list, not just its name.

Usage (from the project folder):
    python -m pip install pandas openpyxl
    python scripts/foods/build_foods.py
Downloads are cached in .food-cache/ (git-ignored).
"""
import io
import json
import math
import os
import re
import sys
import urllib.request
import zipfile

import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CACHE = os.path.join(ROOT, '.food-cache')
OUT = os.path.join(ROOT, 'src', 'data', 'foods-extra.json')
ICONS = os.path.join(ROOT, 'node_modules', '@expo', 'vector-icons', 'build', 'vendor', 'react-native-vector-icons', 'glyphmaps', 'MaterialCommunityIcons.json')

INDB_BASE = 'https://raw.githubusercontent.com/lindsayjaacks/Indian-Nutrient-Databank-INDB-/main/'
FNDDS_ZIP = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip'


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print('downloading', url)
        req = urllib.request.Request(url, headers={'User-Agent': 'platewise-food-builder'})
        with urllib.request.urlopen(req) as r, open(path, 'wb') as f:
            f.write(r.read())
    return path


# ---------------------------------------------------------------- classification

NONVEG = re.compile(
    r"\b(chicken|beef|pork|ham|bacon|turkey|duck|goose|lamb|mutton|goat|veal|venison|bison|rabbit|meat|meats|"
    r"sausages?|pepperoni|salami|bologna|frankfurters?|hot ?dogs?|chorizo|prosciutto|pastrami|jerky|liver|kidneys?|"
    r"gizzards?|tripe|fish|tuna|salmon|cod|tilapia|catfish|trout|mackerel|sardines?|anchov(y|ies)|herring|pollock|"
    r"haddock|halibut|swordfish|shrimps?|prawns?|crabs?|lobsters?|clams?|oysters?|mussels?|scallops?|squid|calamari|"
    r"octopus|crayfish|roe|caviar|keema|kheema|kheema|gelatin|lard|suet|seafood|poultry|surimi|fish sauce|oyster sauce|"
    r"abalone|conch|whelks?|escargots?|snails?|frogs?|(?<!black )turtles?(?!,?\s*beans?)|alligator|eels?|quail|pheasant|squab|"
    r"murg|murgh|gosht|machli|macchi|jhinga)\b",
    re.I,
)
EGG = re.compile(r"\b(eggs?|omelets?|omelettes?|mayonnaise|mayo|meringues?|custards?|quiche|eggnog|anda)\b", re.I)
NOT_EGG = re.compile(r"eggless|egg-free|egg free|eggplant|egg substitute, vegan", re.I)


# Food tables call eggs "Egg, poultry" or "hen egg": those are eggs, not meat.
EGG_NAMES = re.compile(r"\b(eggs?,?\s*(poultry|hen|duck|quail)|(poultry|hen|duck|quail),?\s*eggs?)\b", re.I)
# "Rolls, hamburger or hot dog" is bread, not meat.
BUNS = re.compile(r"((rolls?|buns?),?\s*(hamburger|hot ?dog|frankfurter)(\s*or\s*(hamburger|hot ?dog|frankfurter))?|(hamburger|hot ?dog|frankfurter)(\s*or\s*(hamburger|hot ?dog|frankfurter))?\s*(rolls?|buns?))", re.I)
BURGER = re.compile(r"\b(hamburgers?|cheeseburgers?|burgers?)\b", re.I)
# Plant-based versions of meat dishes ("Veggie burger", "Bacon strip, meatless", "Paneer seekh kebab").
# "Imitation crab" is surimi, which is made from fish, so it doesn't count as plant-based.
VEG_VERSION = re.compile(
    r"meatless|meat substitute|meat alternative|meat-alternative|meat extender|meat analog|imitation(?! crab)|vegetarian|vegan|veggie|plant-based|"
    r"textured vegetable protein|\b(veg|vegetable|aloo|potato|paneer|mushroom|bean|black bean|soy|soya|tofu|quinoa|chickpea|falafel|lentil|dal)\s+"
    r"(burgers?|patty|patties|cutlets?|kebabs?|kababs?|seekh|sausages?|nuggets?|bacon|hot ?dogs?|meatballs?|mince|keema)",
    re.I,
)


def _meaty(text):
    return bool(NONVEG.search(text) or BURGER.search(text))


def diet_of(name, ingredients=''):
    """Non-veg if the dish or any real ingredient is meat or fish; egg if it has eggs; otherwise veg."""
    clean = lambda t: BUNS.sub('bun', EGG_NAMES.sub('egg', t if isinstance(t, str) else ''))
    name, ingredients = clean(name), clean(ingredients)
    parts = [p for p in ingredients.split('|') if p.strip()]
    if VEG_VERSION.search(name):
        # Trust the plant-based name; only ingredients that are themselves real meat count.
        meaty = any(_meaty(p) and not VEG_VERSION.search(p) for p in parts)
    else:
        meaty = _meaty(name) or any(_meaty(p) and not VEG_VERSION.search(p) for p in parts)
    if meaty:
        return 'nonveg'
    if EGG.search(NOT_EGG.sub('', name + ' | ' + ingredients)):
        return 'egg'
    return 'veg'


DRINK = re.compile(r"\b(tea|chai|coffee|espresso|cappuccino|latte|juice|lassi|shake|milkshake|sherbet|sharbat|smoothie|cooler|lemonade|"
                   r"nimbu pani|drink|punch|buttermilk|chaach|chhach|thandai|kanji|mocktail|cocktail|hot chocolate|jaljeera|panna|"
                   r"soda|cola|beer|wine|whisky|whiskey|rum|vodka|gin|liqueur|milk)\b", re.I)
NOT_DRINK = re.compile(r"\b(cake|cookie|biscuit|kheer|payasam|halwa|pudding|sweet|burfi|barfi|peda|ladoo|laddu|rabri|kulfi|curry|rice|bread|toast|pancake|souffle|mousse|ice cream|kofta|paneer|khoa|khoya|condensed)\b", re.I)
DESSERT = re.compile(r"\b(kheer|payasam|halwa|halva|ladoo|laddu|laddoo|barfi|burfi|peda|gulab jamun|jalebi|rasgulla|rasmalai|ras malai|sandesh|"
                     r"mithai|cake|cakes|cupcake|pastry|pastries|pie|cookie|cookies|brownie|brownies|pudding|ice cream|kulfi|custard|mousse|"
                     r"souffle|tart|shrikhand|phirni|firni|malpua|gujiya|chikki|fudge|candy|toffee|cheesecake|trifle|doughnut|donut|"
                     r"rabri|rabdi|basundi|modak|mysore pak|sheera|kesari|payesh|sweet)\b", re.I)
OTHER = re.compile(r"\b(chutney|pickle|achaar|achar|sauce|dip|dressing|jam|marmalade|ketchup|ghee|butter|oil|masala powder|spice mix)\b", re.I)


def indb_category(name):
    if DESSERT.search(name):
        return 'Dessert'
    if DRINK.search(name) and not NOT_DRINK.search(name):
        return 'Drink'
    if OTHER.search(name):
        return 'Other'
    return 'Food'


FNDDS_SKIP = {9002, 9004, 9006, 9007, 9008, 9010, 9012, 9202, 9204, 9402, 9404, 9602, 7702, 7704, 9999}
FNDDS_DRINK = {1002, 1004, 1006, 1008, 1202, 1204, 1206, 1208, 1402, 1902} | set(range(7002, 7900))
FNDDS_DESSERT = {5502, 5504, 5506, 5702, 5704, 5802, 5804, 5806}
FNDDS_OTHER = {2804, 8002, 8004, 8006, 8008, 8010, 8012, 8402, 8404, 8406, 8408, 8410, 8412, 8802, 8804, 8806, 9802}


def fndds_category(code):
    if code in FNDDS_DRINK:
        return 'Drink'
    if code in FNDDS_DESSERT:
        return 'Dessert'
    if code in FNDDS_OTHER:
        return 'Other'
    return 'Food'


ICON_RULES = [
    (r"\b(pizza)\b", 'pizza'),
    (r"\b(burger|hamburger|cheeseburger)\b", 'hamburger'),
    (r"\b(hot ?dog|frankfurter)\b", 'food-hot-dog'),
    (r"\b(taco|burrito|quesadilla|nachos?|enchilada|fajita)\b", 'taco'),
    (r"\b(sushi|dumpling|momo|egg roll|spring roll|wonton)\b", 'food-takeout-box-outline'),
    (r"\b(noodles?|pasta|spaghetti|macaroni|lasagna|ramen|chow mein|lo mein|maggi)\b", 'pasta'),
    (r"\b(rice|biryani|biriyani|pulao|pulav|khichdi|fried rice)\b", 'rice'),
    (r"\b(soup|broth|shorba|rasam|stew)\b", 'pot-steam-outline'),
    (r"\b(salad|koshimbir|kachumber)\b", 'leaf'),
    (r"\b(sandwich|toast|bread|bun|roll|bagel|croissant|muffin|pav|naan|kulcha)\b", 'bread-slice-outline'),
    (r"\b(roti|chapati|chapathi|paratha|parantha|puri|poori|bhatura|thepla|tortilla|pancake|cheela|chilla|dosa|uttapam|appam)\b", 'circle-slice-8'),
    (r"\b(idli|dhokla|vada|wada|bonda|pakora|pakoda|bhajji|bhaji|samosa|kachori|cutlet|tikki|kebab|kabab)\b", 'food-croissant'),
    (r"\b(egg|eggs|omelet|omelette|anda)\b", 'egg-outline'),
    (r"\b(chicken|turkey|duck|poultry|murg|murgh|wings?|drumstick)\b", 'food-drumstick-outline'),
    (r"\b(fish|salmon|tuna|shrimp|prawn|crab|lobster|seafood|machli|jhinga)\b", 'fish'),
    (r"\b(beef|pork|lamb|mutton|goat|steak|meat|bacon|ham|sausage|keema|gosht)\b", 'food-steak'),
    (r"\b(cheese|paneer)\b", 'cheese'),
    (r"\b(dal|daal|dhal|sambar|rajma|chole|chana|lentil|beans?|peas|legume)\b", 'pot-mix-outline'),
    (r"\b(potato|aloo|fries|chips)\b", 'french-fries'),
    (r"\b(popcorn)\b", 'popcorn'),
    (r"\b(nuts?|almonds?|cashews?|peanuts?|walnuts?|pistachios?|seeds?)\b", 'peanut-outline'),
    (r"\b(apple|banana|mango|orange|grapes?|berries|berry|strawberr\w*|pineapple|papaya|melon|watermelon|peach|pear|guava|fruit)\b", 'food-apple-outline'),
    (r"\b(carrot|spinach|palak|broccoli|cabbage|cauliflower|gobi|vegetables?|sabzi|subzi|bhindi|okra|beans|tomato|onion|corn)\b", 'carrot'),
    (r"\b(ice cream|kulfi|frozen yogurt|sorbet)\b", 'ice-cream'),
    (r"\b(cake|cupcake|cheesecake|brownie|pastry|pie|tart|doughnut|donut)\b", 'cupcake'),
    (r"\b(cookie|cookies|biscuit|biscuits|cracker)\b", 'cookie-outline'),
    (r"\b(candy|chocolate|toffee|fudge|ladoo|laddu|barfi|burfi|peda|jalebi|gulab jamun|mithai|sweet)\b", 'candy-outline'),
    (r"\b(kheer|payasam|pudding|custard|halwa|phirni|rabri|shrikhand)\b", 'bowl'),
    (r"\b(yogurt|yoghurt|curd|dahi|raita)\b", 'cup-outline'),
    (r"\b(coffee|espresso|cappuccino|latte)\b", 'coffee-outline'),
    (r"\b(tea|chai)\b", 'tea-outline'),
    (r"\b(beer)\b", 'glass-mug-variant'),
    (r"\b(wine)\b", 'glass-wine'),
    (r"\b(whisky|whiskey|rum|vodka|gin|cocktail|liquor|margarita)\b", 'glass-cocktail'),
    (r"\b(soda|cola|soft drink|energy drink|sport drink)\b", 'bottle-soda-outline'),
    (r"\b(juice|smoothie|shake|milkshake|lassi|sherbet|sharbat|lemonade|drink)\b", 'cup'),
    (r"\b(milk)\b", 'cup-outline'),
    (r"\b(sauce|chutney|pickle|achaar|ketchup|dip|dressing|jam)\b", 'bottle-tonic-outline'),
    (r"\b(oil|ghee|butter)\b", 'water-outline'),
    (r"\b(cereal|oats|oatmeal|porridge|muesli|granola|poha|upma)\b", 'bowl-mix-outline'),
    (r"\b(curry|masala|korma|makhani|kadai|kadhai|do piaza|vindaloo|tikka)\b", 'pot-steam-outline'),
]
CAT_ICON = {'Food': 'food-variant', 'Drink': 'cup-outline', 'Dessert': 'cupcake', 'Other': 'bottle-tonic-outline'}


def icon_of(name, cat):
    for pat, icon in ICON_RULES:
        if re.search(pat, name, re.I):
            return icon
    return CAT_ICON[cat]


# ---------------------------------------------------------------- helpers

def r1(v):
    if v is None or (isinstance(v, float) and math.isnan(v)) or v < 0:
        return 0
    return round(float(v), 1)


# Largest believable weight for one household unit; anything above is a data slip and dropped.
UNIT_MAX = {'piece': 150, 'biscuit': 40, 'cookie': 60, 'slice': 150, 'tablespoon': 25, 'teaspoon': 8, 'cup': 300, 'tea cup': 250,
            'glass': 350, 'tall glass': 450, 'bowl': 350, 'small bowl': 250, 'soup bowl': 350, 'curry bowl': 350, 'plate': 450, 'egg': 120}
BOWLS = {'bowl', 'small bowl', 'soup bowl', 'curry bowl', 'katori'}


def indb_units(unit, grams, cat):
    out = []
    unit = unit.strip().lower() if isinstance(unit, str) else ''
    if unit in BOWLS and cat != 'Drink':
        out.append(['katori', 150])
    if unit and grams and not math.isnan(grams):
        g = round(grams)
        if 3 <= g <= UNIT_MAX.get(unit, 250):
            label = {'tea cup': 'cup', 'parantha': 'paratha'}.get(unit, unit)
            if label not in [u[0] for u in out]:
                out.append([label, g])
    return out


def clean_fndds_name(n):
    n = re.sub(r',?\s*NS as to [^,]+', '', n)
    n = re.sub(r',\s*NFS\b', '', n)
    n = re.sub(r'\s+', ' ', n).strip(' ,')
    return n


def fndds_units(rows):
    out = []
    serving = None
    for r in rows:
        desc, g = str(r.portion_description), float(r.gram_weight or 0)
        if not (1 <= g <= 1500):
            continue
        if desc.startswith('Quantity not specified'):
            serving = serving or ['serving', round(g)]
            continue
        if re.search(r"school|guideline|container|infant|baby|NLEA|inch|'", desc, re.I):
            continue
        m = re.match(r'^1 (.+)$', desc)
        if not m:
            continue
        label = re.split(r'[,(]', m.group(1))[0].strip().lower()
        label = label.replace('fl oz', 'fl oz')
        if not label or len(label) > 18 or label in [u[0] for u in out]:
            continue
        out.append([label, round(g)])
        if len(out) >= 3:
            break
    if serving and len(out) < 3 and 'serving' not in [u[0] for u in out]:
        out.append(serving)
    return out


# ---------------------------------------------------------------- INDB

def build_indb():
    x = pd.read_excel(fetch(INDB_BASE + 'INDB.xlsx', 'INDB.xlsx'))
    rec = pd.read_excel(fetch(INDB_BASE + 'recipes.xlsx', 'recipes.xlsx'))
    ingredients = rec.groupby('recipe_code').apply(
        lambda g: ' | '.join(str(v) for v in list(g['ingredient_name_org']) + list(g['food_name']) if isinstance(v, str)),
        include_groups=False,
    ).to_dict()
    rows = []
    for r in x.itertuples():
        name = re.sub(r'\s+', ' ', str(r.food_name)).strip()
        kcal = r1(r.energy_kcal)
        if not name or kcal <= 0 or kcal > 950:
            continue
        # INDB counts all the oil used for deep or shallow frying as eaten, so fried items can read
        # more than double their real value (poori at 738 kcal). Leave those out rather than mislead;
        # the app's own foods cover them with realistic values.
        if r1(r.fat_g) > 45 or kcal > 620:
            continue
        cat = indb_category(name)
        diet = diet_of(name, ingredients.get(r.food_code, ''))
        grams = (r.unit_serving_energy_kcal / r.energy_kcal * 100) if r.energy_kcal and not math.isnan(r.unit_serving_energy_kcal) else float('nan')
        base = 'ml' if cat == 'Drink' else 'g'
        n = [round(kcal), r1(r.carb_g), r1(r.protein_g), r1(r.fat_g), r1(r.fibre_g), r1(min(r1(r.freesugar_g), r1(r.carb_g) or 0))]
        rows.append(['in-' + r.food_code, name, cat, icon_of(name, cat), diet, n, indb_units(r.servings_unit, grams, cat), base, 'indb'])
    return rows


# ---------------------------------------------------------------- USDA FNDDS

# FNDDS uses the legacy nutrient numbers: 208 energy (kcal), 205 carbohydrate, 203 protein, 204 fat, 291 fibre, 269 total sugars.
NUTRIENTS = {208: 0, 205: 1, 203: 2, 204: 3, 291: 4, 269: 5}


def build_fndds():
    z = zipfile.ZipFile(fetch(FNDDS_ZIP, 'fndds.zip'))

    def csv(name):
        path = next(p for p in z.namelist() if p.endswith('/' + name))
        return pd.read_csv(io.BytesIO(z.read(path)), low_memory=False)

    food = csv('food.csv')
    survey = csv('survey_fndds_food.csv')[['fdc_id', 'wweia_category_number']]
    cats = csv('wweia_food_category.csv').set_index('wweia_food_category')['wweia_food_category_description'].to_dict()
    nut = csv('food_nutrient.csv')
    nut = nut[nut['nutrient_id'].isin(NUTRIENTS.keys())]
    nut_by = {}
    for r in nut.itertuples():
        nut_by.setdefault(r.fdc_id, [0, 0, 0, 0, 0, 0])[NUTRIENTS[r.nutrient_id]] = r.amount
    por = csv('food_portion.csv').sort_values(['fdc_id', 'seq_num'])
    por_by = {k: list(g.itertuples()) for k, g in por.groupby('fdc_id')}
    inp = csv('input_food.csv')
    ing_by = inp.groupby('fdc_id')['sr_description'].apply(lambda s: ' | '.join(str(v) for v in s)).to_dict()

    rows = []
    food = food.merge(survey, on='fdc_id', how='left')
    for r in food.itertuples():
        code = int(r.wweia_category_number) if not math.isnan(r.wweia_category_number) else 9999
        if code in FNDDS_SKIP:
            continue
        n = nut_by.get(r.fdc_id)
        if not n or n[0] <= 0 or n[0] > 950:
            continue
        name = clean_fndds_name(str(r.description))
        cat = fndds_category(code)
        diet = diet_of(name, ing_by.get(r.fdc_id, ''))
        base = 'ml' if cat == 'Drink' else 'g'
        vals = [round(n[0]), r1(n[1]), r1(n[2]), r1(n[3]), r1(n[4]), r1(min(n[5], n[1]))]
        alias = cats.get(code, '').lower()
        rows.append(['us-' + str(r.fdc_id), name, cat, icon_of(name, cat), diet, vals, fndds_units(por_by.get(r.fdc_id, [])), base, 'usda', alias])
    return rows


def main():
    icons = set(json.load(open(ICONS, encoding='utf-8')))
    used = {p[1] for p in ICON_RULES} | set(CAT_ICON.values())
    missing = sorted(i for i in used if i not in icons)
    if missing:
        sys.exit(f'unknown icons: {missing}')
    indb, fndds = build_indb(), build_fndds()
    rows = indb + fndds
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, separators=(',', ':'))
    size = os.path.getsize(OUT)
    from collections import Counter
    print(f'wrote {OUT}: {len(indb)} INDB + {len(fndds)} USDA foods, {size / 1024:.0f} KB')
    print('diet', Counter(r[4] for r in rows), 'cat', Counter(r[2] for r in rows))


if __name__ == '__main__':
    main()
