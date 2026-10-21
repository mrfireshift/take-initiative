// Rimebound Link became data with profile v26 (`linkResistance`): an older profile kept the trait as manual text.
export function withoutLinkResistance(profile) {
  for (const entry of profile?.abilities || []) {
    if (!entry.linkResistance) continue;
    entry.automation = "UNSUPPORTED";
    delete entry.linkResistance;
    entry.manualText = entry.rawText;
  }
  return profile;
}
