function normalizeWishType(type) {
  const raw = String(type || '').trim();
  if (raw === '团队') return '团队';
  if (raw === '单人' || raw === '个人' || raw === '通用') return '单人';
  return null;
}

function isSingleWish(type) {
  return normalizeWishType(type) === '单人';
}

function isTeamWish(type) {
  return normalizeWishType(type) === '团队';
}

function mapWishRecord(wish) {
  return { ...wish, type: normalizeWishType(wish.type) || wish.type };
}

module.exports = { normalizeWishType, isSingleWish, isTeamWish, mapWishRecord };
