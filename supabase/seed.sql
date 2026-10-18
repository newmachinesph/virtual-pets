-- Reference data. Re-applied on every `supabase db reset`.

-- Base decay per hour + notify threshold. Tune here, nowhere else (spec §5).
insert into public.stat_config (stat, decay_per_hour, notify_threshold, label) values
  ('hunger',             4.0, 25, 'Hunger'),
  ('energy',             3.5, 25, 'Energy'),
  ('exercise',           3.0, 25, 'Exercise'),
  ('happiness',          2.5, 25, 'Happiness'),
  ('mental_stimulation', 2.5, 25, 'Mental'),
  ('cleanliness',        1.5, 25, 'Clean'),
  ('health',             0.0, 40, 'Health');

insert into public.actions (key, label, deltas, coin_reward, cooldown_seconds, effect) values
  ('feed',  'Feed',  '{"hunger": 40, "happiness": 5}',                                              1, 1800,  'crumbs'),
  ('water', 'Water', '{"health": 10, "energy": 5}',                                                 1, 900,   'droplets'),
  ('play',  'Play',  '{"happiness": 30, "energy": -15, "exercise": 10, "hunger": -5}',              2, 900,   'hearts'),
  ('walk',  'Walk',  '{"exercise": 35, "happiness": 15, "energy": -20, "hunger": -10, "cleanliness": -10}', 3, 3600, 'leaves'),
  ('groom', 'Groom', '{"cleanliness": 50, "happiness": 10}',                                        2, 3600,  'sparkles'),
  ('train', 'Train', '{"mental_stimulation": 40, "happiness": 10, "energy": -15}',                  5, 3600,  'stars'),
  ('sleep', 'Sleep', '{"energy": 60}',                                                              1, 14400, 'zzz');

-- Breed multipliers make breeds *feel* different — education by consequence (spec §8).
insert into public.breeds (species, name, decay_overrides, care_notes) values
  ('dog', 'Border Collie',      '{"exercise": 1.6, "mental_stimulation": 1.6}',
   'A working breed bred to run all day. Without long walks and puzzle work a Collie invents its own job — usually herding your furniture.'),
  ('dog', 'Bulldog',            '{"energy": 1.5, "exercise": 0.7}',
   'Flat-faced breeds tire fast and overheat easily. Short, frequent, cool-weather walks beat one long one.'),
  ('dog', 'Labrador Retriever', '{"hunger": 1.4, "exercise": 1.2}',
   'Labs are famously food-motivated and prone to weight gain. Measure meals; use part of the ration for training.'),
  ('dog', 'German Shepherd',    '{"mental_stimulation": 1.5, "exercise": 1.3}',
   'Highly trainable and easily bored. Daily training sessions matter as much as physical exercise.'),
  ('dog', 'Golden Retriever',   '{"cleanliness": 1.3, "happiness": 1.2}',
   'A double coat that sheds year-round and a deeply social dog. Brush often; do not leave one alone all day.'),
  ('dog', 'Chihuahua',          '{"energy": 1.3, "happiness": 1.3}',
   'Small body, big attachment. Needs warmth, gentle handling and real socialisation to avoid fear-based snapping.'),
  ('dog', 'Poodle',             '{"cleanliness": 1.5, "mental_stimulation": 1.4}',
   'That curly coat mats without regular grooming, and a Poodle is smart enough to need a job.'),
  ('dog', 'Beagle',             '{"hunger": 1.4, "mental_stimulation": 1.3}',
   'A nose with a dog attached. Scent games satisfy a Beagle in a way a plain walk never will.'),
  ('dog', 'Siberian Husky',     '{"exercise": 1.8, "energy": 0.8}',
   'Bred to pull sleds for hours. Under-exercised Huskies escape, dig and howl. This is not a low-effort dog.'),
  ('dog', 'Dachshund',          '{"exercise": 0.8, "mental_stimulation": 1.2}',
   'Long back, short legs: keep weight down and discourage jumping off furniture to protect the spine.'),
  ('cat', 'Persian',            '{"cleanliness": 1.7, "exercise": 0.7}',
   'A long coat mats within days. Daily brushing and eye cleaning are not optional for a Persian.'),
  ('cat', 'Siamese',            '{"mental_stimulation": 1.6, "happiness": 1.4}',
   'Loud, clever and intensely social. A bored Siamese will tell you about it, repeatedly, at 3am.'),
  ('cat', 'Maine Coon',         '{"hunger": 1.3, "cleanliness": 1.3}',
   'Big cats with big appetites and a semi-long coat. Weekly grooming and a scratching post that fits them.'),
  ('cat', 'Ragdoll',            '{"happiness": 1.3, "exercise": 0.8}',
   'Docile and people-oriented, which makes them poor candidates for being left alone or let outdoors.'),
  ('cat', 'Bengal',             '{"exercise": 1.6, "mental_stimulation": 1.5}',
   'Closer to a wild cat in energy. Climbing space, water play and puzzle feeders keep a Bengal sane.'),
  ('cat', 'British Shorthair',  '{"hunger": 1.2, "exercise": 0.7}',
   'Calm and prone to putting on weight. Watch portions and start play sessions yourself — they will not.'),
  ('cat', 'Sphynx',             '{"cleanliness": 1.8, "energy": 1.2}',
   'No coat means skin oils build up: weekly bathing, warm rooms, and more calories than you would expect.'),
  ('cat', 'Domestic Shorthair', '{}',
   'The all-rounder. Balanced needs, but still wants daily play, clean litter and a vet check each year.');

insert into public.achievements (key, name, description, coin_reward, icon, rule) values
  ('first_meal',    'First Meal',        'Fed your pet for the first time.',        10, 'bowl',   '{"type":"action_count","action":"feed","count":1}'),
  ('first_walk',    'First Walk',        'Took your pet out for the first time.',   10, 'paw',    '{"type":"action_count","action":"walk","count":1}'),
  ('first_groom',   'Clean Start',       'Groomed your pet for the first time.',    10, 'brush',  '{"type":"action_count","action":"groom","count":1}'),
  ('trainer',       'Trainer',           'Completed 10 training sessions.',         40, 'star',   '{"type":"action_count","action":"train","count":10}'),
  ('walker',        'Regular Walker',    'Completed 25 walks.',                     60, 'paw',    '{"type":"action_count","action":"walk","count":25}'),
  ('streak_3',      'Three in a Row',    'Checked in three days running.',          20, 'flame',  '{"type":"streak","count":3}'),
  ('streak_7',      'Week Strong',       'Checked in seven days running.',          50, 'flame',  '{"type":"streak","count":7}'),
  ('streak_30',     'Devoted',           'Checked in thirty days running.',        250, 'crown',  '{"type":"streak","count":30}'),
  ('thriving',      'Thriving',          'Every stat above 80 at once.',           100, 'heart',  '{"type":"all_stats_above","value":80}');

insert into public.accessories (id, name, slot, species, price_coins, asset) values
  ('collar_red',    'Red Collar',      'collar', null,  30,  'collar_red'),
  ('collar_blue',   'Blue Collar',     'collar', null,  30,  'collar_blue'),
  ('collar_gold',   'Gold Collar',     'collar', null, 150,  'collar_gold'),
  ('hat_party',     'Party Hat',       'hat',    null,  60,  'hat_party'),
  ('hat_winter',    'Winter Beanie',   'hat',    null,  80,  'hat_winter'),
  ('bandana_green', 'Green Bandana',   'collar', 'dog', 45,  'bandana_green'),
  ('bow_pink',      'Pink Bow',        'hat',    'cat', 45,  'bow_pink'),
  ('bed_basic',     'Cushion Bed',     'bed',    null, 100,  'bed_basic'),
  ('bed_luxury',    'Luxury Bed',      'bed',    null, 300,  'bed_luxury');

-- Situation -> EatWagLove article (spec §9). Marketing edits these rows, no deploy.
insert into public.content_links (situation, title, url) values
  ('hunger',             'How much should you actually feed your pet?', 'https://eatwaglove.com/feeding-guide'),
  ('cleanliness',        'Grooming without the wrestling match',        'https://eatwaglove.com/grooming-guide'),
  ('exercise',           'How much exercise does your breed need?',     'https://eatwaglove.com/exercise-guide'),
  ('mental_stimulation', 'Enrichment ideas for a bored pet',            'https://eatwaglove.com/enrichment'),
  ('happiness',          'Reading your pet''s body language',           'https://eatwaglove.com/body-language'),
  ('energy',             'Sleep, rest and why pets need so much of it', 'https://eatwaglove.com/rest'),
  ('health',             'Signs it is time to call the vet',            'https://eatwaglove.com/vet-signs'),
  ('train',              'Training basics that actually stick',         'https://eatwaglove.com/training-basics'),
  ('breed',              'Breed guides',                                'https://eatwaglove.com/breeds'),
  ('video',              'Watch: everyday care in five minutes',        'https://www.youtube.com/@eatwaglove');
