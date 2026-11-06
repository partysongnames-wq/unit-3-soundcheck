// Avatar options (original designs). Shared by the server (validation) and clients (creator + drawing).
export const AVATAR = {
  skin: ['#ffe0c7', '#f6c9a0', '#e8ae7c', '#c98a5a', '#9a6440', '#6b4229'],
  hair: ['bob', 'long', 'buns', 'ponytail', 'pixie', 'braids', 'curly', 'twintails'],
  hairColor: ['#2a1a14', '#5b3824', '#a4602f', '#f0c870', '#ff8fc0', '#9b7bff', '#3fd0d4', '#f4f1ff'],
  outfit: ['uniform', 'hoodie', 'sporty', 'dress', 'overalls', 'jacket'],
  outfitColor: ['#ff6b8b', '#ffb703', '#3ddc84', '#2ec4ff', '#8f6bff', '#ff7ae0', '#f4f1ff', '#2b2d42'],
  acc: ['none', 'bow', 'catears', 'headphones', 'flower', 'starclips', 'bunnyears', 'glasses', 'crown'],
  face: ['smile', 'grin', 'cool', 'wink']
};
export const AVATAR_KEYS = Object.keys(AVATAR);
export const LABELS = {
  skin: 'Skin', hair: 'Hair', hairColor: 'Hair colour', outfit: 'Outfit', outfitColor: 'Outfit colour', acc: 'Extra', face: 'Face'
};
export const NAMES = {
  hair: ['Bob', 'Long', 'Space buns', 'Ponytail', 'Pixie', 'Braids', 'Curly', 'Twin tails'],
  outfit: ['School uniform', 'Hoodie', 'Sporty', 'Dress', 'Overalls', 'Jacket'],
  acc: ['None', 'Bow', 'Cat ears', 'Headphones', 'Flower', 'Star clips', 'Bunny ears', 'Glasses', 'Crown'],
  face: ['Smile', 'Big grin', 'Cool', 'Wink']
};

export function randomAvatar(rng = Math.random) {
  const a = {};
  for (const k of AVATAR_KEYS) a[k] = Math.floor(rng() * AVATAR[k].length);
  return a;
}

/** Clamp any input into a valid avatar (never throws). */
export function cleanAvatar(input) {
  const a = {};
  for (const k of AVATAR_KEYS) {
    const v = input && Number.isInteger(input[k]) ? input[k] : 0;
    a[k] = Math.max(0, Math.min(AVATAR[k].length - 1, v));
  }
  return a;
}

export const EMOTES = ['wave', 'dance', 'heart', 'laugh', 'wow', 'star', 'sing', 'clap', 'cool'];
export const EMOTE_ICON = { wave: '👋', dance: '💃', heart: '💖', laugh: '😂', wow: '😮', star: '⭐', sing: '🎤', clap: '👏', cool: '😎' };
