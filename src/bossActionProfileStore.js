import { validateBossActionProfile } from "./bossActionProfileCore.js";

export const BOSS_ACTION_PROFILE_STORAGE_KEY = "com.thebigpicture.initiative/bossActionProfiles/v1";

export function latestRevision(profileId, profiles = []) {
  return profiles.reduce((best, row) => row.profileId !== profileId ? best
    : !best || row.profileVersion >= best.profileVersion ? row : best, null);
}

export function createBossActionProfileStore({ storage = globalThis.localStorage } = {}) {
  function read() {
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") throw new Error("Boss action profile local storage is unavailable");
    const raw = storage.getItem(BOSS_ACTION_PROFILE_STORAGE_KEY);
    if (raw === null || raw === undefined) return [];
    const envelope = JSON.parse(raw);
    if (!envelope || envelope.version !== 1 || !Array.isArray(envelope.profiles) || Object.keys(envelope).some((key) => !["version", "profiles"].includes(key))) throw new Error("Invalid boss action profile storage envelope");
    const profiles = envelope.profiles.map(validateBossActionProfile);
    const keys = new Set();
    for (const profile of profiles) {
      const key = `${profile.profileId}\n${profile.profileRevision}`;
      if (keys.has(key)) throw new Error("Invalid duplicate boss action profile revision");
      keys.add(key);
    }
    return profiles;
  }
  function get(profileId, profileRevision) {
    return read().find((row) => row.profileId === profileId && row.profileRevision === profileRevision) || null;
  }
  function put(value) {
    const profile = validateBossActionProfile(value);
    const profiles = read();
    const existing = profiles.find((row) => row.profileId === profile.profileId && row.profileRevision === profile.profileRevision);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(profile)) throw new Error("Boss action profile revision conflict; import a new revision");
      return existing;
    }
    write([...profiles, profile]);
    return profile;
  }
  function write(profiles) {
    storage.setItem(BOSS_ACTION_PROFILE_STORAGE_KEY, JSON.stringify({ version: 1, profiles }));
  }
  const sameRevision = (row, ref) => row.profileId === ref?.profileId && row.profileRevision === ref?.profileRevision;
  // The newest revision of a profile (boss + phase): highest parser version, then the last imported.
  function supersededRevisions({ keep = [] } = {}) {
    const profiles = read();
    const latest = new Map(profiles.map((row) => [row.profileId, latestRevision(row.profileId, profiles).profileRevision]));
    return profiles.filter((row) => latest.get(row.profileId) !== row.profileRevision && !keep.some((ref) => sameRevision(row, ref)));
  }
  return {
    put,
    get,
    list: read,
    exportProfile(profileId, profileRevision) {
      const profile = get(profileId, profileRevision);
      if (!profile) throw new Error("Boss action profile revision not found");
      return JSON.stringify(profile, null, 2);
    },
    importProfile(json) {
      if (typeof json !== "string") throw new Error("Boss action profile import must be JSON text");
      return put(JSON.parse(json));
    },
    supersededRevisions,
    // Local cleanup only: token bindings are untouched; a token bound to a removed revision asks for a re-import.
    remove(profileId, profileRevision) {
      const profiles = read();
      const next = profiles.filter((row) => !sameRevision(row, { profileId, profileRevision }));
      if (next.length === profiles.length) return false;
      write(next);
      return true;
    },
    prune({ keep = [] } = {}) {
      const stale = supersededRevisions({ keep });
      if (stale.length) write(read().filter((row) => !stale.some((ref) => sameRevision(row, ref))));
      return stale.length;
    },
  };
}
