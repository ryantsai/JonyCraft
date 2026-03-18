const PLAYER_NAME_COOKIE = 'jonycraft_player_name';

const ADJECTIVES = [
  '奶油', '暴走', '佛系', '暗黑', '有感', '社畜', '爆炸', '魔法',
  '躺平', '傳說', '鹹魚', '閃亮', '熱血', '迷因', '量子', '超級',
  '怒吼', '邊緣', '肝帝', '歐皇', '非洲', '神秘', '狂暴', '優雅',
  '搞笑', '冰霜', '雷電', '混沌', '無敵', '光速',
];

const NOUNS = [
  '小僧', '筆電', '柴犬', '勇者', '水母', '布丁', '馬鈴薯', '倉鼠',
  '吐司', '企鵝', '河豚', '珍奶', '鯊魚', '海苔', '貓頭鷹', '竹輪',
  '狐狸', '樹懶', '魔王', '忍者', '菜雞', '老司機', '鍵盤俠', '肉包',
  '蘑菇', '刺蝟', '飯糰', '烏龜', '大俠', '拉麵',
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
  return `${randomFrom(ADJECTIVES)}${randomFrom(NOUNS)}`;
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

export function savePlayerName(name) {
  const trimmed = name.trim().slice(0, 32);
  if (!trimmed) return ensurePlayerName();
  writeCookie(PLAYER_NAME_COOKIE, trimmed);
  return trimmed;
}

export function uniquifyPlayerName(name, existingNames) {
  if (!existingNames.includes(name)) return name;
  let suffix = 1;
  while (existingNames.includes(`${name}-${suffix}`)) suffix += 1;
  return `${name}-${suffix}`;
}
