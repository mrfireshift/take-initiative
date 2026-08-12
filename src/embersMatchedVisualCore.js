import { ID } from "./constants.js";
import { spellAreaGridCells } from "./spellAreaPlacementCore.js";
import { getSpellAreaRules } from "./spellAreaRules.js";

export const EMBERS_ASSET_BASE_URL = "https://jb2a-free.s3.eu-west-3.amazonaws.com";
export const EMBERS_MATCHED_VISUAL_CHANNEL = `${ID}/embers-matched-visual`;
export const EMBERS_MATCHED_VISUAL_EVENT_TYPE = "embers-matched";
export const EMBERS_MATCHED_VISUAL_VERSION = 1;

const STANDARD_TARGET_VARIANTS = Object.freeze([
  { distance: 200, width: 600, height: 400, suffix: "05ft_600x400" },
  { distance: 600, width: 1000, height: 400, suffix: "15ft_1000x400" },
  { distance: 1200, width: 1600, height: 400, suffix: "30ft_1600x400" },
  { distance: 2400, width: 2800, height: 400, suffix: "60ft_2800x400" },
  { distance: 3600, width: 4000, height: 400, suffix: "90ft_4000x400" },
]);

function freeze(value) {
  return Object.freeze(value);
}

function circleEffect(basename, dpi, distance, suffix, duration, variants = null) {
  const definitions = Array.isArray(variants) && variants.length
    ? variants
    : [{ distance, width: distance, height: distance, suffix }];
  return freeze({
    type: "CIRCLE",
    basename,
    dpi,
    variants: freeze(definitions.map((variant) => freeze({
      ...variant,
      width: variant.width ?? variant.distance,
      height: variant.height ?? variant.distance,
      suffixes: Array.isArray(variant.suffixes)
        ? variant.suffixes
        : Array.isArray(variant.suffix)
          ? variant.suffix
          : [variant.suffix],
      duration: variant.duration ?? duration,
    }))),
  });
}

function coneEffect(basename, dpi, distance, width, height, suffix, duration) {
  return freeze({
    type: "CONE",
    basename,
    dpi,
    variants: freeze([freeze({
      distance,
      width,
      height,
      suffix,
      duration,
    })]),
  });
}

function targetEffect(
  basename,
  dpi,
  durations,
  variants = STANDARD_TARGET_VARIANTS,
) {
  return freeze({
    type: "TARGET",
    basename,
    dpi,
    variants: freeze(variants.map((variant, index) => freeze({
      ...variant,
      duration: Array.isArray(durations) ? durations[index] || durations[0] : durations,
      suffixes: Array.isArray(variant.suffix) ? variant.suffix : [variant.suffix],
    }))),
  });
}

function wallEffect(basename, dpi, variants, duration) {
  return freeze({
    type: "WALL",
    basename,
    dpi,
    variants: freeze(variants.map((variant) => freeze({
      ...variant,
      suffixes: [variant.suffix],
      duration,
    }))),
  });
}

const MAGIC_MISSILE_VARIANTS = Object.freeze([
  { distance: 200, width: 600, height: 400, suffix: [
    "05ft_01_600x400", "05ft_02_600x400", "05ft_03_600x400", "05ft_04_600x400",
  ] },
  { distance: 600, width: 1000, height: 400, suffix: [
    "15ft_01_1000x400", "15ft_02_1000x400", "15ft_03_1000x400", "15ft_04_1000x400",
  ] },
  { distance: 1200, width: 1600, height: 400, suffix: [
    "30ft_01_1600x400", "30ft_02_1600x400", "30ft_03_1600x400", "30ft_04_1600x400",
    "30ft_05_1600x400", "30ft_06_1600x400", "30ft_07_1600x400", "30ft_08_1600x400",
    "30ft_09_1600x400",
  ] },
  { distance: 2400, width: 2800, height: 400, suffix: [
    "60ft_01_2800x400", "60ft_02_2800x400", "60ft_03_2800x400", "60ft_04_2800x400",
    "60ft_05_2800x400", "60ft_06_2800x400", "60ft_07_2800x400", "60ft_08_2800x400",
    "60ft_09_2800x400",
  ] },
  { distance: 3600, width: 4000, height: 400, suffix: [
    "90ft_01_4000x400", "90ft_02_4000x400", "90ft_03_4000x400", "90ft_04_4000x400",
  ] },
]);

const EFFECTS = freeze({
  dancingLights: circleEffect(
    "Cantrip/Dancing_Lights/DancingLights_01_BlueTeal", 200, 200, "200x200", 4000,
  ),
  eldritchBlast: targetEffect(
    "Cantrip/Eldritch_Blast/EldritchBlast_01_Regular_Purple", 200, 4370,
  ),
  fireBolt: targetEffect(
    "Cantrip/Fire_Bolt/FireBolt_01_Regular_Orange", 200, [1530, 1530, 1530, 1700, 1800],
  ),
  rayOfFrost: targetEffect(
    "Cantrip/Ray_Of_Frost/RayOfFrost_01_Regular_Blue", 200, [2530, 2530, 2530, 2530, 2600],
  ),
  sacredFlameSource: circleEffect(
    "Cantrip/Sacred_Flame/SacredFlameSource_01_Regular_Yellow", 400, 400, "400x400", 4500,
  ),
  sacredFlameTarget: circleEffect(
    "Cantrip/Sacred_Flame/SacredFlameTarget_01_Regular_Yellow", 400, 400, "400x400", 5430,
  ),
  tollTheDead: circleEffect(
    "Cantrip/Toll_The_Dead/TollTheDead_01_Regular_Green", 400, 400, "400x400", 3530,
  ),
  armsOfHadar: circleEffect(
    "1st_Level/Arms_Of_Hadar/ArmsOfHadar_01_Dark_Purple_75OPA", 500, 500, "500x500", 5000,
  ),
  bardicInspiration: circleEffect(
    "1st_Level/Bardic_Inspiration/BardicInspiration_01_Regular_GreenOrange", 400, 400, "400x400", 2470,
  ),
  blessIntro: circleEffect(
    "1st_Level/Bless/Bless_01_Regular_Yellow_Intro", 200, 400, "400x400", 5000,
    [
      { distance: 200, width: 200, height: 200, suffix: "200x200" },
      { distance: 400, width: 400, height: 400, suffix: "400x400" },
    ],
  ),
  blessLoop: circleEffect(
    "1st_Level/Bless/Bless_01_Regular_Yellow_Loop", 200, 400, "400x400", 6040,
    [
      { distance: 200, width: 200, height: 200, suffix: "200x200" },
      { distance: 400, width: 400, height: 400, suffix: "400x400" },
    ],
  ),
  burningHands: coneEffect(
    "1st_Level/Burning_Hands/BurningHands_01_Regular_Orange", 600, 600, 600, 600, "600x600", 5570,
  ),
  cureWounds: circleEffect(
    "1st_Level/Cure_Wounds/CureWounds_01_Blue", 200, 400, "400x400", 2470,
    [
      { distance: 200, width: 200, height: 200, suffix: "200x200" },
      { distance: 400, width: 400, height: 400, suffix: "400x400" },
    ],
  ),
  detectMagic: circleEffect(
    "1st_Level/Detect_Magic/DetectMagicCircle_01_Regular_Blue", 200, 1200, "1200x1200", 4003,
  ),
  entangleIntro: circleEffect(
    "1st_Level/Entangle/Opacities/Entangle02_02_Regular_Green_75OPA", 100, 500, "500x500", 8330,
  ),
  entangleLoop: circleEffect(
    "1st_Level/Entangle/Opacities/EntangleLoop02_02_Regular_Green_75OPA", 100, 500, "500x500", 4170,
  ),
  fogCloud: circleEffect(
    "1st_Level/Fog_Cloud/Opacities/FogCloud_01_White_75OPA", 200, 800, "800x800", 5040,
  ),
  grease: circleEffect(
    "1st_Level/Grease/Grease_Dark_Brown", 200, 600, "600x600", 10030,
  ),
  guidingBolt: targetEffect(
    "1st_Level/Guiding_Bolt/GuidingBolt_01_Regular_BlueYellow", 200,
    [5670, 5730, 5900, 6030, 6230],
  ),
  glintMany: circleEffect(
    "Generic/Item/GlintMany01", 100, 200, "01_Regular_Yellow_200x200", 4625,
    [{
      distance: 200,
      width: 200,
      height: 200,
      suffix: [
        "01_Regular_Yellow_200x200",
        "02_Regular_Yellow_200x200",
        "03_Regular_Yellow_200x200",
        "04_Regular_Yellow_200x200",
      ],
    }],
  ),
  huntersMarkPulse: circleEffect(
    "1st_Level/Hunters_Mark/HuntersMark_01_Regular_Green_Pulse", 200, 200, "200x200", 5000,
  ),
  huntersMarkLoop: circleEffect(
    "1st_Level/Hunters_Mark/HuntersMark_01_Regular_Green_Loop", 200, 200, "200x200", 5000,
  ),
  magicMissile: targetEffect(
    "1st_Level/Magic_Missile/MagicMissile_01_Regular_Purple", 200, [1700, 1870, 1870, 2030, 2200], MAGIC_MISSILE_VARIANTS,
  ),
  shieldIntro: circleEffect(
    "1st_Level/Shield/Shield_01_Regular_Blue_Intro", 200, 400, "400x400", 1530,
  ),
  shieldLoop: circleEffect(
    "1st_Level/Shield/Shield_01_Regular_Blue_Loop", 200, 400, "400x400", 4030,
  ),
  shieldOutroFade: circleEffect(
    "1st_Level/Shield/Shield_01_Regular_Blue_OutroFade", 200, 400, "400x400", 1500,
  ),
  shieldFaithIntro: circleEffect(
    "Generic/Marker/MarkerShieldRampart01_01_Regular_Orange", 100, 400, "400x400", 7500,
  ),
  shieldFaithLoop: circleEffect(
    "Generic/Marker/MarkerShieldRampartLoop01_01_Regular_Orange", 100, 400, "400x400", 4330,
  ),
  sleepSymbol: circleEffect(
    "1st_Level/Sleep/SleepSymbol01_01_Regular_Pink", 100, 400, "400x400", 2540,
  ),
  cloudOfDaggers: circleEffect(
    "2nd_Level/Cloud_Of_Daggers/CloudOfDaggers_01_Light_Blue", 100, 400, "400x400", 5000,
  ),
  darkness: circleEffect(
    "2nd_Level/Darkness/Opacities/Darkness_01_Black_75OPA", 200, 600, "600x600", 5000,
  ),
  cloudkill: circleEffect(
    "2nd_Level/Darkness/Opacities/Darkness_01_Green_75OPA", 200, 600, "600x600", 5000,
  ),
  flamingSphere: circleEffect(
    "2nd_Level/Flaming_Sphere/Opacities/FlamingSphere_01_Orange_75OPA", 100, 200, "200x200", 5040,
  ),
  mistyStepOut: circleEffect(
    "2nd_Level/Misty_Step/MistyStep_01_Regular_Blue", 100, 400, "400x400", 3000,
  ),
  mistyStepIn: circleEffect(
    "2nd_Level/Misty_Step/MistyStep_02_Regular_Blue", 100, 400, "400x400", 4870,
  ),
  gustOfWind: coneEffect(
    "2nd_Level/Gust_Of_Wind/GustOfWind_01_White", 200, 1200, 1200, 200, "1200x200", 4030,
  ),
  holdPersonIntro: circleEffect(
    "Generic/Marker/Simple/MarkerSimpleComplete001_001_Blue", 200, 600, "600x600", 5000,
  ),
  holdPersonLoop: circleEffect(
    "Generic/Marker/MarkerChainSpectralStandard01_02_Regular_Blue_Loop", 100, 400, "400x400", 8330,
  ),
  moonbeamIntro: circleEffect(
    "2nd_Level/Moonbeam/MoonbeamIntro_01_Regular_Blue", 100, 400, "400x400", 4210,
  ),
  moonbeamRegular: circleEffect(
    "2nd_Level/Moonbeam/Moonbeam_01_Regular_Blue", 100, 400, "400x400", 5040,
  ),
  scorchingRay: targetEffect(
    "2nd_Level/Scorching_Ray/ScorchingRay_01_Regular_Orange", 200, [1800, 1800, 1800, 2030, 2030],
  ),
  shatter: circleEffect(
    "2nd_Level/Shatter/Shatter_01_Blue", 100, 400, "400x400", 3030,
  ),
  silence: circleEffect(
    "Generic/Energy/Soundwave01_01_Regular_Blue", 200, 600, "600x600", 2580,
  ),
  spiritualWeapon: circleEffect(
    "2nd_Level/Spiritual_Weapon/SpiritualWeapon_Glaive01_02_Spectral_Green", 100, 400, "400x400", 5040,
  ),
  web: circleEffect(
    "2nd_Level/Web/Opacities/Web_01_White_01_75OPA", 100, 400, "400x400", 5040,
  ),
  callLightning: circleEffect(
    "3rd_Level/Call_Lightning/CallLightning_01_Blue", 200, 1000, "1000x1000", 4000,
  ),
  lightningBolt: coneEffect(
    "3rd_Level/Lightning_Bolt/LightningBolt_01_Regular_Blue", 200, 4000, 4000, 200, "4000x200", 4000,
  ),
  windWall: wallEffect(
    "3rd_Level/Wind_Wall/WindWall_01_75OPA", 100,
    [
      { distance: 100, width: 100, height: 100, suffix: "100x100" },
      { distance: 200, width: 200, height: 100, suffix: "200x100" },
      { distance: 300, width: 300, height: 100, suffix: "300x100" },
      { distance: 500, width: 500, height: 100, suffix: "500x100" },
    ], 4000,
  ),
  sleetStorm: circleEffect(
    "3rd_Level/Sleet_Storm/SleetStorm_01_Blue", 200, 800, "800x800", 6250,
  ),
  spiritGuardians: circleEffect(
    "3rd_Level/Spirit_Guardians/SpiritGuardians_01_Light_BlueYellow", 200, 600, "600x600", 6250,
  ),
  rangedSpell: targetEffect(
    "Generic/RangedSpell/02/RangedInstant02_01_Regular_Yellow", 200, [930, 1470, 1730, 1630, 1830],
  ),
  portal: circleEffect(
    "Generic/Portals/Portal_Bright_Yellow_H", 100, 400, "400x400", 8042,
  ),
  blackTentacles: circleEffect(
    "4th_Level/Black_Tentacles/BlackTentacles_01_Dark_Purple", 200, 600, "600x600", 5000,
  ),
  wallOfFireLine: wallEffect(
    "4th_Level/Wall_Of_Fire/Opacities/WallOfFire_01_Blue_75OPA", 100,
    [
      { distance: 100, width: 100, height: 100, suffix: "100x100" },
      { distance: 200, width: 200, height: 100, suffix: "200x100" },
      { distance: 300, width: 300, height: 100, suffix: "300x100" },
      { distance: 500, width: 500, height: 100, suffix: "500x100" },
    ], 4000,
  ),
  wallOfFireRing: circleEffect(
    "4th_Level/Wall_Of_Fire/Opacities/WallOfFire_01_Blue_Ring_75OPA", 100, 400, "400x400", 4000,
  ),
  antilifeShell: circleEffect(
    "5th_Level/Antilife_Shell/AntilifeShell_01_Blue_Circle", 100, 400, "400x400", 4000,
  ),
  arcaneHand: circleEffect(
    "5th_Level/Arcane_Hand/ArcaneHand_Human_01_Idle_Blue", 100, 400, "400x400", 4096,
  ),
  coneOfCold: coneEffect(
    "5th_Level/Cone_Of_Cold/ConeOfCold_01_Regular_Blue", 200, 600, 600, 600, "600x600", 4400,
  ),
  wallOfForce: wallEffect(
    "5th_Level/Wall_Of_Force/WallOfForce_01_Grey_V", 100,
    [{ distance: 200, width: 200, height: 25, suffix: "200x25" }], 4040,
  ),
  chainLightningPrimary: targetEffect(
    "6th_Level/Chain_Lightning/ChainLightning_01_Regular_Blue", 200,
    [1630, 1670, 1700, 1730, 1770],
    STANDARD_TARGET_VARIANTS.map((variant) => ({
      ...variant,
      suffix: variant.suffix.replace("_", "_Primary_").replace("05ft_Primary_", "05ft_Primary_"),
    })),
  ),
  chainLightningSecondary: targetEffect(
    "6th_Level/Chain_Lightning/ChainLightning_01_Regular_Blue", 200,
    [1200, 1270, 1300, 1330, 1330],
    STANDARD_TARGET_VARIANTS.map((variant) => ({
      ...variant,
      suffix: variant.suffix.replace("05ft_", "05ft_Secondary_")
        .replace("15ft_", "15ft_Secondary_")
        .replace("30ft_", "30ft_Secondary_")
        .replace("60ft_", "60ft_Secondary_")
        .replace("90ft_", "90ft_Secondary_"),
    })),
  ),
  disintegrate: targetEffect(
    "6th_Level/Disintegrate/Disintegrate_01_Regular_Green01", 200,
    [3030, 2930, 2970, 3030, 3030, 3030],
    [
      { distance: 200, width: 600, height: 400, suffix: "05ft_600x400" },
      { distance: 600, width: 1000, height: 400, suffix: "15ft_1000x400" },
      { distance: 1200, width: 1600, height: 400, suffix: "30ft_1600x400" },
      { distance: 1800, width: 2200, height: 400, suffix: "45ft_2200x400" },
      { distance: 2400, width: 2800, height: 400, suffix: "60ft_2800x400" },
      { distance: 3600, width: 4000, height: 400, suffix: "90ft_4000x400" },
    ],
  ),
  genericHealingPurple: circleEffect(
    "Generic/Healing/HealingAbility_01_Purple", 100, 400, "400x400", 1700,
    [
      { distance: 200, width: 200, height: 200, suffix: "200x200" },
      { distance: 400, width: 400, height: 400, suffix: "400x400" },
    ],
  ),
  genericMarkerPurple: circleEffect(
    "Generic/Marker/Simple/MarkerSimpleComplete001_001_Purple", 200, 600, "600x600", 5000,
  ),
  markerHorror: circleEffect(
    "Generic/Marker/MarkerHorror_02_Regular_Purple", 100, 400, "400x400", 6040,
  ),
  daggerThrow: targetEffect(
    "Generic/Weapon_Attacks/Ranged/Dagger01_01_Regular_White", 200,
    [1500, 1600, 1630, 1770, 1930],
    [
      { distance: 600, width: 1000, height: 400, suffix: "15ft_1000x400" },
      { distance: 1200, width: 1600, height: 400, suffix: "30ft_1600x400" },
      { distance: 1800, width: 2200, height: 400, suffix: "45ft_2200x400" },
      { distance: 2400, width: 2800, height: 400, suffix: "60ft_2800x400" },
      { distance: 3600, width: 4000, height: 400, suffix: "90ft_4000x400" },
    ],
  ),
  iceBurst: circleEffect(
    "Generic/Ice/IceSpikesRadialBurst_01_Regular_White", 100, 1000, "1000x1000", 4033,
  ),
  thunderExplosion: circleEffect(
    "Generic/Explosion/Explosion_02_Blue", 100, 400, "400x400", 1370,
  ),
  whirlwind: circleEffect(
    "7th_Level/Whirlwind/Whirlwind_01_BlueGrey_01", 100, 400, "400x400", 8040,
  ),
  musicNote: circleEffect(
    "Generic/Marker/MarkerMusicNote_03_Regular_Blue", 100, 400, "400x400", 6040,
  ),
});

const canonicalSpellIds = [
  "dancing-lights", "eldritch-blast", "fire-bolt", "ray-of-frost", "sacred-flame",
  "bless", "burning-hands", "cure-wounds", "detect-magic", "entangle", "fog-cloud",
  "grease", "guiding-bolt", "hunters-mark", "shield", "shield-of-faith", "sleep",
  "darkness", "flaming-sphere", "misty-step", "gust-of-wind", "hold-person", "hold-monster", "moonbeam",
  "scorching-ray", "shatter", "silence", "spiritual-weapon", "web", "call-lightning",
  "fireball", "lightning-bolt", "wind-wall", "sleet-storm", "spirit-guardians", "banishment",
  "black-tentacles", "dimension-door", "wall-of-fire", "antilife-shell", "arcane-hand",
  "cone-of-cold", "wall-of-force", "chain-lightning", "disintegrate", "cloudkill",
];

const sourceAwareSpellIds = [
  "xanathar-aculeo-mentale",
  "xanathar-rintocco-dei-morti",
  "phb2014-braccia-di-hadar",
  "phb2014-sortilegio",
  "xanathar-coltello-di-ghiaccio",
  "phb2014-nube-di-pugnali",
  "xanathar-passo-del-tuono",
  "xanathar-turbine",
];

export const EMBERS_MATCHED_SPELL_IDS = freeze([
  ...canonicalSpellIds,
  ...sourceAwareSpellIds,
  "magic-missile",
]);
export const EMBERS_MATCHED_CLASS_FEATURE_IDS = freeze([
  "bardo-ispirazione-bardica",
]);

function visualDuration(options = {}) {
  const duration = Number(options.duration);
  return Number.isFinite(duration) ? duration : undefined;
}

const target = (effectId, options = {}) => ({
  kind: "target",
  effectId,
  delay: Number(options.delay) || 0,
  persistent: options.persistent === true,
  attachedTo: options.attachedTo || "",
  duration: visualDuration(options),
});
const chain = (primaryEffectId, secondaryEffectId, options = {}) => ({
  kind: "chain",
  effectId: primaryEffectId,
  secondaryEffectId,
  delay: Number(options.delay) || 0,
  persistent: options.persistent === true,
  attachedTo: options.attachedTo || "",
  layer: options.layer || "ATTACHMENT",
  duration: visualDuration(options),
});
const circle = (effectId, anchor = "area", options = {}) => ({
  kind: "circle",
  effectId,
  anchor,
  scale: Number(options.scale) > 0 ? Number(options.scale) : 1,
  ...(Number(options.radiusCells) > 0
    ? { radiusCells: Number(options.radiusCells) }
    : {}),
  ...(String(options.replicate || "").trim()
    ? { replicate: String(options.replicate).trim() }
    : {}),
  ...(options.firstTargetIsCaster === true ? { firstTargetIsCaster: true } : {}),
  delay: Number(options.delay) || 0,
  persistent: options.persistent === true,
  attachedTo: options.attachedTo || "",
  layer: options.layer || "",
  duration: visualDuration(options),
});
const cone = (effectId, options = {}) => ({
  kind: "cone",
  effectId,
  delay: Number(options.delay) || 0,
  persistent: options.persistent === true,
  attachedTo: options.attachedTo || "",
  layer: options.layer || "",
  duration: visualDuration(options),
});
const wall = (effectId, options = {}) => ({
  kind: "wall",
  effectId,
  delay: Number(options.delay) || 0,
  persistent: options.persistent === true,
  attachedTo: options.attachedTo || "",
  duration: visualDuration(options),
});

const persistent = (options = {}) => ({ ...options, persistent: true });

const HOLD_CONTROL_VISUALS = freeze([
  circle("holdPersonIntro", "target", { scale: 2, attachedTo: "target", layer: "ATTACHMENT" }),
  circle("holdPersonLoop", "target", persistent({
    delay: 350,
    scale: 1.5,
    attachedTo: "target",
    layer: "ATTACHMENT",
  })),
]);

const VISUALS = freeze({
  "dancing-lights": [circle("dancingLights", "target", persistent({ attachedTo: "target" }))],
  "eldritch-blast": [target("eldritchBlast")],
  "fire-bolt": [target("fireBolt")],
  "ray-of-frost": [target("rayOfFrost")],
  "sacred-flame": [circle("sacredFlameSource", "caster"), circle("sacredFlameTarget", "target", { delay: 3000 })],
  bless: [
    circle("blessIntro", "target", { attachedTo: "target" }),
    circle("blessLoop", "target", persistent({ delay: 4000, attachedTo: "target" })),
  ],
  "burning-hands": [cone("burningHands", { attachedTo: "caster" })],
  "cure-wounds": [circle("cureWounds", "target")],
  "detect-magic": [circle("detectMagic", "area", persistent({ attachedTo: "caster" }))],
  entangle: [
    circle("entangleIntro", "area", { duration: 7000 }),
    circle("entangleLoop", "area", persistent({ delay: 6000 })),
  ],
  "fog-cloud": [circle("fogCloud", "area", persistent())],
  grease: [circle("grease", "area", persistent())],
  "guiding-bolt": [
    target("guidingBolt"),
    circle("glintMany", "target", persistent({ delay: 3500, attachedTo: "target" })),
  ],
  "hunters-mark": [
    circle("huntersMarkPulse", "target"),
    circle("huntersMarkLoop", "target", persistent({ delay: 2500, scale: 0.5, attachedTo: "target" })),
  ],
  shield: [
    circle("shieldIntro", "caster", { scale: 1.5, duration: 1200 }),
    circle("shieldLoop", "caster", persistent({ delay: 1100, scale: 1.5, attachedTo: "caster" })),
  ],
  "shield-of-faith": [
    circle("shieldFaithIntro", "target", { attachedTo: "target" }),
    circle("shieldFaithLoop", "target", persistent({ delay: 6200, attachedTo: "target" })),
  ],
  sleep: [circle("sleepSymbol", "target", persistent({ attachedTo: "target" }))],
  darkness: [circle("darkness", "area", persistent())],
  "flaming-sphere": [circle("flamingSphere", "area", persistent({ attachedTo: "zone" }))],
  "misty-step": [circle("mistyStepOut", "caster"), circle("mistyStepIn", "target", { delay: 1500 })],
  "gust-of-wind": [cone("gustOfWind", persistent({
    attachedTo: "caster",
    layer: "ATTACHMENT",
  }))],
  "hold-person": HOLD_CONTROL_VISUALS,
  "hold-monster": HOLD_CONTROL_VISUALS,
  moonbeam: [circle("moonbeamIntro"), circle("moonbeamRegular", "area", persistent({
    delay: 2000,
    attachedTo: "zone",
  }))],
  "scorching-ray": [target("scorchingRay")],
  shatter: [circle("shatter")],
  silence: [circle("silence", "area", persistent())],
  "spiritual-weapon": [circle("spiritualWeapon", "area", persistent())],
  web: [circle("web", "area", persistent({ layer: "DRAWING" }))],
  "call-lightning": [circle("callLightning", "area", persistent())],
  fireball: [],
  "lightning-bolt": [cone("lightningBolt", { attachedTo: "caster" })],
  "wind-wall": [wall("windWall", persistent())],
  "sleet-storm": [circle("sleetStorm", "area", persistent())],
  "spirit-guardians": [circle("spiritGuardians", "area", persistent({ attachedTo: "caster" }))],
  banishment: [
    target("rangedSpell"),
    circle("portal", "target", persistent({
      delay: 200,
      scale: 2.5,
      attachedTo: "target",
      layer: "ATTACHMENT",
    })),
  ],
  "black-tentacles": [circle("blackTentacles", "area", persistent())],
  "dimension-door": [
    circle("portal", "caster", { scale: 2.5, duration: 3000 }),
    circle("portal", "target", { delay: 200, scale: 2.5, duration: 3000 }),
  ],
  "wall-of-fire": [wall("wallOfFireLine", persistent()), circle("wallOfFireRing", "area", persistent())],
  "antilife-shell": [circle("antilifeShell", "area", persistent({ attachedTo: "caster" }))],
  "arcane-hand": [circle("arcaneHand", "area", persistent())],
  "cone-of-cold": [cone("coneOfCold", { attachedTo: "caster" })],
  "wall-of-force": [wall("wallOfForce", persistent())],
  "chain-lightning": [chain("chainLightningPrimary", "chainLightningSecondary", { delay: 1000 })],
  disintegrate: [target("disintegrate")],
  cloudkill: [circle("cloudkill", "area", persistent())],
  "xanathar-aculeo-mentale": [circle("genericHealingPurple", "target")],
  "xanathar-rintocco-dei-morti": [circle("tollTheDead", "target")],
  // Embers resolves this as one-shot circles replicated to every selected
  // target, with the caster inserted as the first target. Each blueprint's
  // size is `radius + target.size` (4 cells by default), not the placed area
  // preview and not a concentration loop.
  "phb2014-braccia-di-hadar": [circle("armsOfHadar", "target", {
    radiusCells: 4,
    replicate: "all",
    firstTargetIsCaster: true,
    attachedTo: "target",
    layer: "ATTACHMENT",
  })],
  "phb2014-sortilegio": [
    circle("genericMarkerPurple", "target", { scale: 2, layer: "PROP" }),
    circle("markerHorror", "target", persistent({ delay: 2000, attachedTo: "target" })),
  ],
  "xanathar-coltello-di-ghiaccio": [target("daggerThrow"), circle("iceBurst", "target", { delay: 1500 })],
  "phb2014-nube-di-pugnali": [circle("cloudOfDaggers", "area", persistent())],
  "xanathar-passo-del-tuono": [circle("mistyStepOut", "caster"), circle("thunderExplosion", "area", { delay: 900 }), circle("mistyStepIn", "area", { delay: 1000 })],
  "xanathar-turbine": [circle("whirlwind", "area", persistent())],
  "magic-missile": [target("magicMissile")],
  "bardo-ispirazione-bardica": [
    circle("bardicInspiration", "target"),
    circle("musicNote", "target", persistent({ delay: 1000, attachedTo: "target" })),
  ],
});

const END_VISUALS = freeze({
  // Embers sizes the outro from the same 1.5x target size used by intro/loop.
  shield: [circle("shieldOutroFade", "caster", { scale: 1.5 })],
  // Embers does not declare an onDestroy blueprint for Banishment. Reuse the
  // portal clip as a one-shot return visual when the concentration ends.
  banishment: [circle("portal", "target", { scale: 2.5, duration: 3000, layer: "ATTACHMENT" })],
  // Shield of Faith has no onDestroy blueprint in Embers: its attached loop
  // is removed when the lifecycle ends.
});

function finitePoint(value) {
  const x = Number(value?.x);
  const y = Number(value?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function positiveNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizedTarget(targetValue) {
  if (!targetValue) return null;
  const center = finitePoint(targetValue.center || targetValue.position || targetValue);
  if (!center) return null;
  return {
    id: String(targetValue.id || "").trim(),
    center,
    diameter: positiveNumber(targetValue.diameter, 0),
  };
}

function normalizedPreview(preview, sceneDpi) {
  const start = finitePoint(preview?.start);
  const end = finitePoint(preview?.end);
  if (!start) return null;
  const dpi = positiveNumber(preview?.dpi, sceneDpi);
  const explicitRadius = positiveNumber(preview?.radius, 0);
  const type = String(preview?.type || "").trim();
  const radius = explicitRadius || (
    end && !["square", "rectangle"].includes(type)
      ? Math.hypot(end.x - start.x, end.y - start.y)
      : 0
  );
  return {
    type,
    start,
    end: end || start,
    dpi,
    radius,
    targetIds: Array.isArray(preview?.targetIds) ? preview.targetIds : [],
  };
}

function targetSize(targetValue, dpi) {
  return positiveNumber(targetValue?.diameter, dpi);
}

function fallbackTarget(targets, index = 0) {
  return targets[index] || targets[0] || null;
}

function areaCenter(preview, targets, source) {
  if (preview?.start) {
    if (["square", "rectangle"].includes(preview.type)) {
      return {
        x: (preview.start.x + preview.end.x) / 2,
        y: (preview.start.y + preview.end.y) / 2,
      };
    }
    return preview.start;
  }
  return fallbackTarget(targets)?.center || source || null;
}

function defaultAuraRadius(spellId, dpi, gridScale = {}) {
  const auraRule = getSpellAreaRules(spellId, { triggerType: "cast" })
    .find((rule) => rule.kind === "aura" && rule.geometry?.shape === "circle");
  if (!auraRule) return 0;
  const radiusCells = spellAreaGridCells(auraRule.geometry.size, gridScale);
  return positiveNumber(radiusCells, 0) * dpi;
}

function areaRadius(preview, targets, source, dpi, fallbackRadius = 0) {
  if (preview && ["square", "rectangle"].includes(preview.type)) {
    return Math.max(
      Math.abs(preview.end.x - preview.start.x),
      Math.abs(preview.end.y - preview.start.y),
    ) / 2;
  }
  if (preview?.radius > 0) return preview.radius;
  if (fallbackRadius > 0) return fallbackRadius;
  const target = fallbackTarget(targets);
  if (target) return targetSize(target, dpi) / 2;
  return source ? dpi : dpi;
}

function expandedCircleRadius(visual, targetDiameter, dpi) {
  const radiusCells = positiveNumber(visual?.radiusCells, 0);
  if (!radiusCells) return targetDiameter / 2;
  return (radiusCells * dpi + targetDiameter) / 2;
}

function targetCircleCenters(visual, targetPoints, source, sourceDiameter, dpi, casterId) {
  const centers = [];
  const replicatesCaster = visual?.replicate === "all"
    && visual.firstTargetIsCaster === true;
  if (replicatesCaster && source) {
    centers.push({
      center: source,
      radius: expandedCircleRadius(visual, sourceDiameter, dpi),
      targetId: casterId,
    });
  }
  for (const targetValue of targetPoints) {
    if (replicatesCaster && casterId && targetValue.id === casterId) continue;
    centers.push({
      center: targetValue.center,
      radius: expandedCircleRadius(visual, targetSize(targetValue, dpi), dpi),
      targetId: targetValue.id,
    });
  }
  return centers;
}

function buildTargetLayer(effectId, effect, source, destination, delay, index, visual, targetId = "") {
  if (!source || !destination) return null;
  return {
    kind: "target",
    effectId,
    effect,
    delay,
    source,
    destination,
    variantIndex: index,
    persistent: visual?.persistent === true,
    attachedTo: visual?.attachedTo || "",
    ...(String(visual?.layer || "").trim()
      ? { layer: String(visual.layer).trim() }
      : {}),
    ...(Number.isFinite(Number(visual?.duration))
      ? { duration: Number(visual.duration) }
      : {}),
    ...(String(targetId || "").trim() ? { targetId: String(targetId).trim() } : {}),
  };
}

function buildCircleLayer(effectId, effect, anchor, center, radius, delay, visual, targetId = "") {
  if (!center) return null;
  return {
    kind: "circle",
    effectId,
    effect,
    delay,
    center,
    radius,
    anchor: anchor.anchor,
    scale: visual?.scale ?? anchor.scale,
    persistent: visual?.persistent === true,
    attachedTo: visual?.attachedTo || "",
    ...(String(visual?.layer || "").trim()
      ? { layer: String(visual.layer).trim() }
      : {}),
    ...(Number.isFinite(Number(visual?.duration))
      ? { duration: Number(visual.duration) }
      : {}),
    ...(String(targetId || "").trim() ? { targetId: String(targetId).trim() } : {}),
  };
}

function buildDirectionalLayer(effectId, effect, kind, source, destination, delay, visual) {
  if (!source || !destination) return null;
  return {
    kind,
    effectId,
    effect,
    delay,
    source,
    destination,
    persistent: visual?.persistent === true,
    attachedTo: visual?.attachedTo || "",
    ...(String(visual?.layer || "").trim()
      ? { layer: String(visual.layer).trim() }
      : {}),
    ...(Number.isFinite(Number(visual?.duration))
      ? { duration: Number(visual.duration) }
      : {}),
  };
}

function orderedTargetPoints(targetPoints, targetIds) {
  if (!Array.isArray(targetIds) || !targetIds.length) return targetPoints;
  const pointsById = new Map(targetPoints.map((targetValue) => [targetValue.id, targetValue]));
  return targetIds
    .map((targetId) => pointsById.get(targetId))
    .filter(Boolean);
}

export function getMatchedSpellVisualDefinition(spellId) {
  const normalized = String(spellId || "").trim();
  const visuals = VISUALS[normalized];
  if (!visuals) return null;
  return {
    spellId: normalized,
    visuals: visuals.map((visual) => ({ ...visual })),
    endVisuals: (END_VISUALS[normalized] || []).map((visual) => ({ ...visual })),
    usesExistingFireballRenderer: normalized === "fireball",
  };
}

export function isMatchedSpellVisualSpell(spellId) {
  return EMBERS_MATCHED_SPELL_IDS.includes(String(spellId || "").trim());
}

export function isMatchedClassFeatureVisual(featureId) {
  return EMBERS_MATCHED_CLASS_FEATURE_IDS.includes(String(featureId || "").trim());
}

export function buildMatchedVisualEvent({
  spellId = "",
  eventId = "",
  casterId = "",
  targetIds = [],
  caster = null,
  targets = [],
  preview = null,
  sceneDpi = 1,
  gridScale = {},
  zoneId = "",
  mode = "start",
  lifecycleId = "",
} = {}) {
  const normalizedSpellId = String(spellId || "").trim();
  const definition = getMatchedSpellVisualDefinition(normalizedSpellId);
  if (!definition || definition.usesExistingFireballRenderer) return null;
  const dpi = positiveNumber(preview?.dpi, positiveNumber(sceneDpi, 1));
  const normalizedTargets = (Array.isArray(targets) ? targets : [])
    .map(normalizedTarget)
    .filter(Boolean);
  const previewData = normalizedPreview(preview, dpi);
  const fallbackIds = Array.isArray(targetIds)
    ? targetIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const resolvedTargets = normalizedTargets.length
    ? normalizedTargets
    : fallbackIds.map((id) => ({ id, center: null, diameter: dpi }));
  const targetPoints = resolvedTargets.filter((targetValue) => targetValue.center);
  const normalizedCasterId = String(casterId || "").trim();
  const normalizedZoneId = String(zoneId || "").trim();
  const casterTarget = normalizedTargets.find((targetValue) => (
    normalizedCasterId && targetValue.id === normalizedCasterId
  ));
  const source = finitePoint(caster) || finitePoint(caster?.center) || casterTarget?.center || null;
  const sourceDiameter = positiveNumber(caster?.diameter, dpi);
  const fallbackAreaRadius = defaultAuraRadius(normalizedSpellId, dpi, gridScale);
  const firstTarget = fallbackTarget(targetPoints);
  const fallbackTargetId = firstTarget?.id
    || fallbackIds[0]
    || (!fallbackIds.length ? normalizedCasterId : "");
  const destination = previewData?.end || firstTarget?.center || null;
  const layers = [];
  const visualList = mode === "end"
    ? (definition.endVisuals || [])
    : definition.visuals;

  for (const visual of visualList) {
    const effect = EFFECTS[visual.effectId];
    if (!effect) continue;
    if (visual.kind === "chain") {
      const secondaryEffect = EFFECTS[visual.secondaryEffectId];
      const chainTargets = orderedTargetPoints(targetPoints, fallbackIds);
      const primaryTarget = chainTargets[0];
      if (!secondaryEffect || !source || !primaryTarget) continue;

      const primaryLayer = buildTargetLayer(
        visual.effectId,
        effect,
        source,
        primaryTarget.center,
        0,
        0,
        visual,
        primaryTarget.id,
      );
      if (primaryLayer) layers.push(primaryLayer);

      for (const targetValue of chainTargets.slice(1)) {
        const secondaryLayer = buildTargetLayer(
          visual.secondaryEffectId,
          secondaryEffect,
          primaryTarget.center,
          targetValue.center,
          visual.delay,
          0,
          visual,
          targetValue.id,
        );
        if (secondaryLayer) layers.push(secondaryLayer);
      }
      continue;
    }
    if (visual.kind === "target") {
      const pairs = targetPoints.length
        ? targetPoints.map((targetValue) => ({
          source: source || firstTarget?.center,
          destination: targetValue.center,
          targetId: targetValue.id,
        }))
        : [{ source, destination, targetId: fallbackTargetId }];
      pairs.forEach((pair, index) => {
        const layer = buildTargetLayer(
          visual.effectId,
          effect,
          pair.source,
          pair.destination,
          visual.delay,
          index,
          visual,
          pair.targetId,
        );
        if (layer) layers.push(layer);
      });
      continue;
    }
    if (visual.kind === "circle") {
      const anchor = visual.anchor;
      const centers = anchor === "target"
        ? targetCircleCenters(
          visual,
          targetPoints,
          source,
          sourceDiameter,
          dpi,
          normalizedCasterId,
        )
          : anchor === "caster"
          ? source ? [{ center: source, radius: expandedCircleRadius(visual, sourceDiameter, dpi) }] : []
          : [{
            center: areaCenter(previewData, targetPoints, source),
            radius: areaRadius(
              previewData,
              targetPoints,
              source,
              dpi,
              fallbackAreaRadius,
            ),
          }];
      if (!centers.length && anchor === "target" && (previewData || source)) {
        centers.push({
          center: areaCenter(previewData, targetPoints, source),
          radius: areaRadius(
            previewData,
            targetPoints,
            source,
            dpi,
            fallbackAreaRadius,
          ),
          targetId: fallbackTargetId,
        });
      }
      centers.forEach((entry, index) => {
        const layer = buildCircleLayer(
          visual.effectId,
          effect,
          visual,
          entry.center,
          entry.radius * visual.scale,
          visual.delay,
          visual,
          anchor === "target" ? entry.targetId || targetPoints[index]?.id : "",
        );
        if (layer) layers.push(layer);
      });
      continue;
    }
    if (visual.kind === "cone" || visual.kind === "wall") {
      const layer = buildDirectionalLayer(
        visual.effectId,
        effect,
        visual.kind,
        previewData?.start || source,
        previewData?.end || destination,
        visual.delay,
        visual,
      );
      if (layer) layers.push(layer);
    }
  }

  const normalizedLifecycleId = String(lifecycleId || "").trim();
  const normalizedEventId = String(eventId || "").trim();
  if (!layers.length && !(mode === "end" && normalizedLifecycleId)) return null;
  return {
    type: EMBERS_MATCHED_VISUAL_EVENT_TYPE,
    version: EMBERS_MATCHED_VISUAL_VERSION,
    spellId: normalizedSpellId,
    ...(normalizedEventId ? { eventId: normalizedEventId } : {}),
    ...(normalizedCasterId ? { casterId: normalizedCasterId } : {}),
    ...(normalizedZoneId ? { zoneId: normalizedZoneId } : {}),
    ...(normalizedLifecycleId ? { lifecycleId: normalizedLifecycleId } : {}),
    mode: mode === "end" ? "end" : "start",
    targetIds: fallbackIds,
    dpi,
    layers,
  };
}

export function effectAssetUrl(effect, variant) {
  if (!effect?.basename || !variant?.suffixes?.length) return "";
  const suffix = variant.suffixes[0];
  return `${EMBERS_ASSET_BASE_URL}/${effect.basename}_${suffix}.webm`;
}

export function matchedVisualLayerPlan(layer, sceneDpi = 1) {
  const effect = layer?.effect;
  if (!effect) return null;
  const safeSceneDpi = positiveNumber(sceneDpi, 1);
  const effectDpi = positiveNumber(effect.dpi, safeSceneDpi);
  if (layer.kind === "circle") {
    const radius = positiveNumber(layer.radius, safeSceneDpi / 2);
    const desiredDiameter = (radius * 2) / safeSceneDpi;
    const targetPixels = desiredDiameter * effectDpi;
    const variant = effect.variants.reduce((closest, current) =>
      !closest || Math.abs(current.distance - targetPixels) < Math.abs(closest.distance - targetPixels)
        ? current
        : closest
    , null);
    if (!variant) return null;
    return {
      ...variant,
      url: effectAssetUrl(effect, variant),
      scale: desiredDiameter / (variant.distance / effectDpi),
      position: layer.center,
      rotation: 0,
      offset: { x: 0.5, y: 0.5 },
      duration: layer.duration ?? variant.duration,
    };
  }

  const source = finitePoint(layer.source);
  const destination = finitePoint(layer.destination);
  if (!source || !destination) return null;
  const distanceInGridUnits = Math.hypot(
    destination.x - source.x,
    destination.y - source.y,
  ) / safeSceneDpi;
  const targetPixels = distanceInGridUnits * effectDpi;
  const variant = effect.variants.reduce((closest, current) =>
    !closest || Math.abs(current.distance - targetPixels) < Math.abs(closest.distance - targetPixels)
      ? current
      : closest
  , null);
  if (!variant) return null;
  const suffixes = variant.suffixes || [variant.suffix];
  const suffix = suffixes[Math.abs(Number(layer.variantIndex) || 0) % suffixes.length];
  return {
    ...variant,
    url: `${EMBERS_ASSET_BASE_URL}/${effect.basename}_${suffix}.webm`,
    scale: distanceInGridUnits / (variant.distance / effectDpi),
    position: source,
    rotation: Math.atan2(destination.y - source.y, destination.x - source.x) * (180 / Math.PI),
    offset: effect.type === "TARGET" ? { x: 0.5, y: 0.5 } : { x: 0, y: 0.5 },
    duration: layer.duration ?? variant.duration,
  };
}

export function matchedVisualEffectIds(spellId) {
  const definition = getMatchedSpellVisualDefinition(spellId);
  return definition
    ? definition.visuals.flatMap((visual) => [visual.effectId, visual.secondaryEffectId].filter(Boolean))
    : [];
}
