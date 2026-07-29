const normalizedText = (value, fallback = "", maxLength = 160) =>
  (String(value || "").trim() || fallback).slice(0, maxLength);

function normalizeTarget(value) {
  const id = normalizedText(value?.id, "", 200);
  if (!id) return null;
  return {
    id,
    name: normalizedText(value?.name, "Token", 100),
    portrait: normalizedText(value?.portrait, "", 2048),
  };
}

function itemPortrait(item) {
  return normalizedText(
    item?.image?.url
    || item?.image?.src
    || item?.asset?.image?.url,
    "",
    2048,
  );
}

export function normalizeZoneTriggerNotice(value) {
  const activationId = normalizedText(value?.activationId, "", 300);
  const targets = (Array.isArray(value?.targets) ? value.targets : [])
    .map(normalizeTarget)
    .filter(Boolean);
  if (!activationId || !targets.length) return null;
  return {
    activationId,
    spellName: normalizedText(value?.spellName, "Incantesimo", 100),
    label: normalizedText(
      value?.label,
      "Tiro salvezza richiesto",
      160,
    ),
    targets,
  };
}

export function zoneTriggerNoticeFromActivation(
  activation,
  itemsById = new Map(),
) {
  const source = itemsById instanceof Map ? itemsById : new Map();
  const root = source.get(String(activation?.zoneItemId || ""));
  const targets = (Array.isArray(activation?.targetIds)
    ? activation.targetIds
    : [])
    .map((targetId) => {
      const id = normalizedText(targetId, "", 200);
      const item = source.get(id);
      if (!id || !item) return null;
      return {
        id,
        name: normalizedText(item.name, "Token", 100),
        portrait: itemPortrait(item),
      };
    })
    .filter(Boolean);
  return normalizeZoneTriggerNotice({
    activationId: activation?.id,
    spellName: String(root?.name || "Incantesimo").replace(/^Zona:\s*/i, ""),
    label: activation?.label,
    targets,
  });
}

export function planZoneTriggerNoticeDelivery(
  values = [],
  announcedIds = [],
) {
  const announced = new Set(
    (Array.isArray(announcedIds) ? announcedIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  const notices = [];
  for (const value of Array.isArray(values) ? values : []) {
    const notice = normalizeZoneTriggerNotice(value);
    if (!notice || announced.has(notice.activationId)) continue;
    announced.add(notice.activationId);
    notices.push(notice);
  }
  return {
    notices,
    announcedIds: [...announced],
  };
}
