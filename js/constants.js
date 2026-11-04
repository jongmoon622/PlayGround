export const FIELD = {
  halfW: 34,
  halfL: 44,
  goalHalfW: 11,
  goalH: 10,
  wallH: 14,
  ceiling: 30,
  ballRadius: 2.2,
  ballGround: 2.2,
  goalDepth: 6,
};

export const CAR = {
  halfW: 1.02,
  halfH: 0.42,
  halfL: 1.95,
  groundY: 0.78,
  gravity: 34,
  jumpSpeed: 13.5,
  maxSpeed: 33,
  boostMax: 35,
  reverseMax: 15,
  accel: 34,
  boostAccel: 46,
  friction: 1.15,
  turnRate: 2.65,
};

export const TEAM = {
  blue: { name: 'BLUE', color: 0x2fb6ff, soft: '#8bdcff', dark: 0x0b5e94, goalZ: -FIELD.halfL, attackZ: FIELD.halfL },
  orange: { name: 'ORANGE', color: 0xff7a24, soft: '#ffb167', dark: 0x9c3b08, goalZ: FIELD.halfL, attackZ: -FIELD.halfL },
};

export const ITEM_DEFS = {
  mushroom: { name: 'MUSHROOM', icon: '🍄', color: '#ff5a5a', weight: 22 },
  green: { name: 'GREEN SHELL', icon: '🟢', color: '#49e06b', weight: 21 },
  red: { name: 'RED SHELL', icon: '🔴', color: '#ff4c4c', weight: 15 },
  banana: { name: 'BANANA', icon: '🍌', color: '#ffd84d', weight: 19 },
  star: { name: 'STAR', icon: '⭐', color: '#ffe36e', weight: 7 },
  lightning: { name: 'LIGHTNING', icon: '⚡', color: '#8a7dff', weight: 8 },
  bobomb: { name: 'BOB-OMB', icon: '💣', color: '#ff8a3d', weight: 8 },
};

export const ITEM_POOL = Object.entries(ITEM_DEFS).map(([id, d]) => ({ id, w: d.weight }));

export const DIFFICULTY = {
  rookie: { label: 'ROOKIE', speed: 0.82, aim: 0.55, boost: 0.5, reaction: 0.55, item: 0.35, jump: 0.3 },
  pro: { label: 'PRO', speed: 0.94, aim: 0.82, boost: 0.8, reaction: 0.82, item: 0.72, jump: 0.62 },
  allstar: { label: 'ALL-STAR', speed: 1.02, aim: 1.0, boost: 1.0, reaction: 1.0, item: 1.0, jump: 0.9 },
};

export const BOOST_PADS = [
  { x: -27, z: -27, big: true },
  { x: 27, z: -27, big: true },
  { x: -27, z: 27, big: true },
  { x: 27, z: 27, big: true },
  { x: -16, z: -8, big: false },
  { x: 16, z: -8, big: false },
  { x: -16, z: 8, big: false },
  { x: 16, z: 8, big: false },
  { x: 0, z: -22, big: false },
  { x: 0, z: 22, big: false },
];

export const ITEM_BOX_SPOTS = [
  { x: -17, z: -14 },
  { x: 17, z: -14 },
  { x: -17, z: 14 },
  { x: 17, z: 14 },
  { x: -26, z: 0 },
  { x: 26, z: 0 },
];
