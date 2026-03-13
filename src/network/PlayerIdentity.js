const PLAYER_NAME_COOKIE = 'jonycraft_player_name';

const ADJECTIVES = [
  'Amber', 'Blaze', 'Cloud', 'Crimson', 'Dawn', 'Echo', 'Frost', 'Golden',
  'Jade', 'Lucky', 'Merry', 'Nova', 'Pixel', 'River', 'Silver', 'Sunny',
  'Swift', 'Vivid', 'Wild', 'Zephyr',
];

const NOUNS = [
  'Badger', 'Boar', 'Builder', 'Comet', 'Fox', 'Golem', 'Miner', 'Otter',
  'Panda', 'Pilot', 'Ranger', 'Rider', 'Scout', 'Shark', 'Slime', 'Sprite',
  'Tiger', 'Voyager', 'Warden', 'Wolf',
];

function readCookie(name) {
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? '';
}

function writeCookie(name, value) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function randomFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function generatePlayerName() {
  const number = Math.floor(10 + Math.random() * 90);
  return `${randomFrom(ADJECTIVES)}${randomFrom(NOUNS)}${number}`;
}

export function ensurePlayerName() {
  const saved = decodeURIComponent(readCookie(PLAYER_NAME_COOKIE));
  if (saved) return saved;

  const created = generatePlayerName();
  writeCookie(PLAYER_NAME_COOKIE, created);
  return created;
}

export function rerollPlayerName() {
  const created = generatePlayerName();
  writeCookie(PLAYER_NAME_COOKIE, created);
  return created;
}
