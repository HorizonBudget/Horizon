// ---- Suggestion engine ---------------------------------------------------------------
// A built-in catalog of typical US prices (rough averages, meant as a starting point, not a quote).
// Format per line:  name/synonym/synonym:typical price
const PRICE_CATALOG = {
'Vehicle': `
registration renewal/car registration/vehicle registration/tag renewal/license plate/registration:150
drivers license/driver license/license renewal:40
oil change:90
tire rotation:40
snow tire/winter tire:700
tire/tyre:600
brake pad/brake job/brake:350
car battery/battery replacement:180
windshield wiper/wiper blade:30
windshield/windshield replacement:300
wheel alignment/alignment:100
transmission:2500
engine repair/engine:1500
check engine light/diagnostic:120
state inspection/emissions test/smog check/inspection:50
car insurance/auto insurance:700
car wash:20
car detailing/detailing:200
cabin air filter:40
tune up/car service/car maintenance/car repair:250
dash cam:120
floor mat/all weather floor mat:120
roof rack:300
trailer hitch/tow hitch:400
jump starter:80
coolant flush/radiator:150
spark plug:200
muffler/exhaust:400
roadside assistance/aaa:60
down payment on car/car down payment:3000
motorcycle:9000
`,
'Home': `
hvac service/hvac/furnace repair/furnace/heating repair:200
air conditioner/window ac/ac unit:350
ac repair:300
furnace filter/air filter/hvac filter:25
water filter/fridge filter:40
gutter cleaning/gutter:180
roof repair/roof:1500
plumber/plumbing:300
water heater:900
pest control/exterminator:150
chimney sweep/chimney:200
fence:1500
driveway:2000
painting/repaint/paint:400
septic:400
property tax/home tax:1200
homeowners insurance/home insurance:1400
hoa dues/hoa:300
lawn care/lawn service/landscaping:200
tree removal/tree trimming:600
sprinkler/irrigation:250
mulch:100
fertilizer/weed killer:60
snow blower:700
carpet cleaning:200
window cleaning:150
pressure washing:200
deck repair/deck:1500
new floors/flooring:3000
carpet:2000
kitchen remodel:15000
bathroom remodel:9000
smoke detector/smoke alarm/carbon monoxide detector:30
fire extinguisher:30
security system/home security/doorbell camera:200
smart thermostat/thermostat:150
light bulb/led bulb:30
ceiling fan:150
garage door opener/garage door:500
smart lock/door lock/new locks/locksmith:150
mattress:900
pillow:60
bedding/sheets/comforter:120
couch/sofa:900
recliner/armchair:350
dining table/table:600
desk:250
bookshelf/shelving:150
dresser:400
area rug/rug:250
curtain/blinds:150
lamp:60
mirror:80
refrigerator/fridge:1200
dishwasher:600
washer and dryer:1400
washing machine/washer:700
clothes dryer/dryer:650
oven/range/stove:900
microwave:120
robot vacuum/roomba:250
vacuum:200
blender:50
toaster oven/toaster:40
espresso machine:400
coffee maker/coffee machine:90
air fryer:100
crockpot/slow cooker/instant pot:80
stand mixer/kitchenaid:350
food processor:100
rice cooker:50
hair dryer/blow dryer:40
straightener/flat iron/curling iron:60
electric toothbrush:70
electric razor/razor:70
ironing board/iron:40
air purifier:150
humidifier/dehumidifier:80
space heater:60
grill/bbq/barbecue:350
patio furniture/outdoor furniture:700
fire pit:200
lawn mower/mower:350
leaf blower/weed eater/trimmer:150
power tool/drill:120
tool set/toolbox:100
ladder:100
cookware/pots and pans/knife set:200
dinnerware/dishes:100
towel:50
storage bin:40
cleaning supplies:40
trash can:50
appliance:500
furniture:600
home repair/handyman:250
electrician:300
`,
'Electronics': `
tv/television:500
laptop:800
desktop computer/desktop/pc/computer:900
monitor:250
keyboard/mouse:60
printer:150
ink/toner:60
tablet/ipad:400
iphone/android/cell phone/smartphone/phone:700
phone case/screen protector:30
headphones/earbuds/airpods:150
bluetooth speaker/soundbar/speaker:150
game console/xbox/playstation/ps5/nintendo switch:450
video game:60
router/wifi/modem:120
smart watch/apple watch/fitbit:300
camera:600
gopro/action camera:350
drone:500
external hard drive/ssd:90
charger/charging cable:25
kindle/e-reader:110
projector:400
vr headset:400
smart speaker/echo/alexa/google home:50
roku/fire stick/apple tv/streaming device:50
webcam:70
microphone:100
surge protector:25
`,
'Kids': `
school supplies:150
backpack/lunchbox:60
school uniform:150
school fees:100
field trip:30
school pictures/school photos:50
yearbook:40
summer camp/camp:400
daycare/day care/childcare:1000
babysitter/babysitting:100
tutoring/tutor:300
music lessons/piano lessons/guitar lessons/violin lessons:150
dance class/ballet/gymnastics/swim lessons/karate:150
sports registration/team fees/sports:200
cleats/soccer cleats:60
sports gear/sports equipment:150
helmet:50
stroller:300
crib/bassinet:350
car seat/booster seat:200
high chair:100
diapers/wipes/baby formula/formula:100
baby monitor:100
toys/lego:50
bike/bicycle/scooter:200
trampoline:300
swing set/playset:700
prom/homecoming:300
graduation party/graduation:200
drivers ed/driver ed:400
test prep/sat prep/act prep:60
application fees/college application:100
first communion/baptism/bar mitzvah/confirmation:200
senior pictures:300
class ring:300
school lunch:300
`,
'Education': `
tuition:5000
college/university:10000
graduate school/grad school:15000
textbook:300
online course/udemy/coursera/course:100
certification/exam fee:300
coding bootcamp/bootcamp:12000
conference/workshop:500
professional development/continuing education:400
language class/language lessons:150
dorm supplies/dorm:400
meal plan:2000
student fees:200
`,
'Health': `
dental cleaning/teeth cleaning/dental/dentist:150
invisalign/braces/orthodontist:5000
retainer:300
root canal:1000
dental crown/crown:1200
cavity filling/filling:200
wisdom teeth:1500
dentures:2000
eyeglasses/prescription glasses/glasses:250
contact lenses/contacts:200
eye exam:120
lasik:4000
annual physical/checkup/physical/doctor visit/doctor:100
dermatologist/dermatology/specialist:200
therapy/therapist/counseling:150
chiropractor:75
physical therapy:100
massage/acupuncture:90
prescription/medication/pharmacy:50
vitamins/supplements:40
hearing aids:2000
mammogram/colonoscopy/screening:300
flu shot/vaccine/immunization:40
urgent care/emergency room/er visit:500
surgery:5000
health insurance:400
deductible:1500
gym membership/gym/ymca:50
personal trainer:300
treadmill:800
peloton:1500
exercise bike:600
dumbbells/weights/yoga mat:80
running shoes:130
haircut/hair cut/barber:40
hair color/highlights/salon:150
manicure/pedicure/nails:50
skincare/makeup:60
waxing/eyebrows:50
`,
'Pets': `
vet visit/veterinarian/vet:150
puppy shots/kitten shots/puppy vaccine/kitten vaccine/dog vaccine/cat vaccine/pet vaccine:80
spay/neuter:300
dog food/cat food/pet food:50
adopt a dog/puppy:300
adopt a cat/kitten:150
pet insurance:40
pet grooming/grooming/groomer:70
pet boarding/boarding/kennel/pet sitter/dog walker:60
flea and tick/heartworm:40
dog crate/pet bed/leash/collar:50
cat litter/litter box/litter:25
aquarium/fish tank:150
dog training/obedience class:200
pet dental:400
microchip:50
pet license:20
`,
'Clothing': `
winter coat/coat/jacket:150
sneakers/boots/shoes:100
dress shoes:120
tuxedo/suit:400
formal dress/dress:150
jeans/pants:50
shirt/tee:30
underwear/socks:30
back to school clothes/school clothes:200
wardrobe/clothing/clothes:200
swimsuit:50
work clothes/work boots:120
purse/handbag/wallet:100
watch:150
sunglasses:100
belt/tie:30
snow pants/gloves/hat/scarf/winter gear:60
bridesmaid dress:150
tailoring/alterations/dry cleaning:30
`,
'Holidays & Gifts': `
christmas gifts/holiday gifts/christmas/holiday:500
christmas tree:100
christmas decorations/halloween decorations/decorations:80
halloween costume/costume:40
halloween/candy:50
thanksgiving dinner/thanksgiving:150
easter:60
valentines day/valentine:60
mothers day/fathers day:70
birthday party:250
birthday gift/birthday:100
anniversary dinner/anniversary:150
wedding gift:100
baby shower:60
engagement ring:5000
wedding:15000
bridal shower/bachelorette:150
graduation gift:50
teacher gift:40
stocking stuffers:50
wrapping paper/gift wrap:30
greeting card/cards:20
flowers/bouquet:60
fireworks:80
party supplies:60
gift:75
`,
'Subscriptions': `
netflix:190
hulu:120
disney plus:140
hbo max/max/hbo:200
spotify/apple music:130
youtube premium:140
amazon prime/prime:139
costco membership/costco/sams club:65
microsoft 365/office 365:100
adobe/creative cloud:260
icloud/google one/dropbox:40
chatgpt/claude/ai subscription:240
antivirus/norton/mcafee:60
vpn:60
domain renewal/domain name/domain:20
web hosting/hosting/website:150
newspaper/magazine/new york times:100
audible/kindle unlimited:150
patreon:60
xbox game pass/playstation plus/gaming subscription:80
password manager/1password/lastpass:36
streaming service/streaming:150
app subscription:50
duolingo:80
museum membership/zoo membership/membership:100
software license/license:120
subscription:120
`,
'Travel': `
family vacation/vacation:2500
family trip/trip:1000
flight/airfare/plane ticket:400
airbnb/vrbo/hotel/lodging:600
rental car:300
cruise:2500
disney world/disneyland/disney:4000
road trip:600
campsite/camping:150
national park pass/park pass:80
passport renewal/passport:165
visa:100
travel insurance:120
luggage/suitcase:150
honeymoon:4000
ski trip/ski pass/lift ticket:800
beach trip:1200
family reunion:800
theme park/amusement park/six flags:300
concert ticket/concert:150
game ticket/sporting event:120
weekend getaway/getaway:500
tsa precheck/global entry:100
airport parking:100
baggage fee:60
souvenirs:50
`,
'Other': `
donation/tithe/charity:100
life insurance:600
tax preparation/accountant/taxes:250
lawyer/attorney/legal fees/last will:500
notary:15
storage unit:600
movers/moving truck/moving:1500
funeral:8000
family photos/photographer/portraits:300
craft supplies/hobby:60
`
};

// Broader single-word hints, used when no catalog item matches (category only, no price).
const CATEGORY_HINTS = {
  'Vehicle': 'car truck suv van vehicle auto automotive motorcycle engine mechanic dmv sedan',
  'Home': 'house home kitchen bathroom bedroom yard garden lawn garage furniture appliance repair electrician contractor renovation cleaning',
  'Kids': 'kid child children baby toddler infant school daycare teen teenager nursery',
  'Health': 'doctor medical teeth eye health clinic hospital medicine fitness',
  'Holidays & Gifts': 'present party celebration',
  'Travel': 'airport resort travel hotel flight',
  'Subscriptions': 'subscription membership monthly annual renewal software',
  'Pets': 'pet dog cat puppy kitten hamster horse bird',
  'Clothing': 'outfit boot sock',
  'Education': 'class college university degree training exam',
  'Electronics': 'gadget wireless bluetooth console gaming',
};

function normalizeText(s){
  return String(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function singularize(w){
  if(w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if(/(ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if(w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}
function canon(s){
  return normalizeText(s).split(' ').filter(Boolean).map(singularize).join(' ');
}
function editDistance(a, b){
  if(a === b) return 0;
  const m = a.length, n = b.length;
  if(!m) return n;
  if(!n) return m;
  let prev = Array.from({length: n + 1}, (_, i) => i);
  for(let i = 1; i <= m; i++){
    const cur = [i];
    for(let j = 1; j <= n; j++){
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const CATALOG = [];
const VOCAB = new Set();
const HINT_INDEX = {};
(function buildCatalog(){
  for(const [category, block] of Object.entries(PRICE_CATALOG)){
    block.split('\n').forEach(line => {
      line = line.trim();
      if(!line) return;
      const idx = line.lastIndexOf(':');
      const price = Number(line.slice(idx + 1));
      const names = line.slice(0, idx).split('/').map(s => s.trim()).filter(Boolean);
      const terms = names.map(canon);
      CATALOG.push({ category, price, names, terms });
      terms.forEach(t => t.split(' ').forEach(w => { if(w.length >= 5) VOCAB.add(w); }));
    });
  }
  for(const [category, words] of Object.entries(CATEGORY_HINTS)){
    words.split(' ').forEach(w => { HINT_INDEX[canon(w)] = category; });
  }
})();

function matchCatalog(canonInput){
  const padded = ' ' + canonInput + ' ';
  let best = null;
  for(const entry of CATALOG){
    for(let i = 0; i < entry.terms.length; i++){
      const t = entry.terms[i];
      if(padded.includes(' ' + t + ' ')){
        const score = t.length + t.split(' ').length * 3; // longer, more specific phrases win
        if(!best || score > best.score) best = { entry, score, name: entry.names[i] };
      }
    }
  }
  return best;
}

// Fix likely typos by snapping long words to the closest word we know.
function fuzzyCorrect(canonInput){
  let changed = false;
  const fixed = canonInput.split(' ').map(w => {
    if(w.length < 5 || VOCAB.has(w)) return w;
    const maxD = w.length >= 9 ? 2 : 1;
    let bestWord = null, bestD = maxD + 1;
    for(const v of VOCAB){
      if(Math.abs(v.length - w.length) > maxD) continue;
      const d = editDistance(w, v);
      if(d < bestD){ bestD = d; bestWord = v; }
    }
    if(bestWord){ changed = true; return bestWord; }
    return w;
  });
  return changed ? fixed.join(' ') : null;
}

// Returns { category, price|null, label|null, confidence: 'match' | 'close' | 'guess' } or null.
function suggestForName(name){
  const input = canon(name);
  if(!input) return null;

  let m = matchCatalog(input);
  if(m) return { category: m.entry.category, price: m.entry.price, label: m.name, confidence: 'match' };

  const fixed = fuzzyCorrect(input);
  if(fixed){
    m = matchCatalog(fixed);
    if(m) return { category: m.entry.category, price: m.entry.price, label: m.name, confidence: 'close' };
  }

  const tally = {};
  input.split(' ').forEach(w => { const c = HINT_INDEX[w]; if(c) tally[c] = (tally[c] || 0) + 1; });
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  if(ranked.length) return { category: ranked[0][0], price: null, label: null, confidence: 'guess' };
  return null;
}

// Optional real-AI lookup. A web page can't hold an API key safely, so this needs a small server
// that asks a model and replies with { "category": "...", "price": 123 }. Leave blank to stay offline.
const AI_SUGGEST_URL = '';
let aiTimer = null, aiToken = 0;
function scheduleAiSuggest(name){
  if(!AI_SUGGEST_URL) return;
  clearTimeout(aiTimer);
  const token = ++aiToken;
  aiTimer = setTimeout(async () => {
    try {
      const res = await fetch(AI_SUGGEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, categories: sortedCategoryList().filter(c => c !== 'Other') })
      });
      if(!res.ok) return;
      const data = await res.json();
      if(token !== aiToken || document.getElementById('f_name').value.trim() !== name) return;
      const category = sortedCategoryList().includes(data.category) ? data.category : null;
      const price = Number(data.price) > 0 ? Math.round(Number(data.price)) : null;
      if(!category && !price) return;
      applySuggestion({ category: category || document.getElementById('f_category').value, price, label: null, confidence: 'ai' });
    } catch(e) { /* stay with the offline suggestion */ }
  }, 600);
}

let costManuallyEdited = false;
let categoryManuallyPicked = false;
function onCostInput(){ costManuallyEdited = true; }

function suggestionHintHtml(s){
  const cat = `<strong>${escapeHtml(s.category)}</strong>`;
  const price = s.price != null ? `<strong>$${s.price.toLocaleString()}</strong>` : '';
  if(s.confidence === 'match') return `Looks like ${cat}, about ${price} for a typical ${escapeHtml(s.label)}. Adjust anytime.`;
  if(s.confidence === 'close') return `Closest match: ${escapeHtml(s.label)}. ${cat}, about ${price}. Adjust anytime.`;
  if(s.confidence === 'ai') return `AI estimate: ${cat}${price ? ', about ' + price : ''}. Adjust anytime.`;
  return `Best guess: ${cat}. No typical price on file, so add your own estimate.`;
}

function applySuggestion(s){
  const categorySel = document.getElementById('f_category');
  const costField = document.getElementById('f_cost');
  if(!categoryManuallyPicked && s.category && categorySel.value !== s.category && sortedCategoryList().includes(s.category)){
    populateCategorySelect(s.category);
    populateSubcategoryField(s.category, '');
  }
  if(!costManuallyEdited) costField.value = s.price != null ? s.price : '';
  document.getElementById('nameHint').innerHTML = suggestionHintHtml(s);
}

function onNameInput(){
  const name = document.getElementById('f_name').value.trim();
  const hint = document.getElementById('nameHint');
  const costField = document.getElementById('f_cost');

  if(!name){
    hint.innerHTML = '';
    if(!costManuallyEdited) costField.value = '';
    return;
  }
  const s = suggestForName(name);
  if(s){
    applySuggestion(s);
  } else {
    if(!costManuallyEdited) costField.value = '';
    hint.textContent = name.length >= 4 ? 'No typical price on file for this one. Pick a category and add your own estimate.' : '';
  }
  if(!s || s.confidence === 'guess') scheduleAiSuggest(name);
}
