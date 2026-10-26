const key = "dawami-offline-profile";
export function clearOfflineProfile() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
}
export function saveOfflineProfile(profile: any, device: string) {
  if (
    profile.owner ||
    !profile.member ||
    profile.mustChange ||
    !profile.deviceBound ||
    profile.locked
  ) {
    clearOfflineProfile();
    return;
  }
  const { csrf, memberships, ...snapshot } = profile;
  localStorage.setItem(
    key,
    JSON.stringify({ ...snapshot, memberships: [], offlineDevice: device }),
  );
  sessionStorage.removeItem(key);
}
export function readOfflineProfile(device: string, now = Date.now()) {
  try {
    const profile = JSON.parse(localStorage.getItem(key) || "null");
    if (
      !profile ||
      profile.owner ||
      profile.mustChange ||
      profile.locked ||
      !profile.member ||
      !profile.deviceBound ||
      profile.offlineDevice !== device ||
      !(profile.expires > now)
    ) {
      clearOfflineProfile();
      return null;
    }
    const { csrf, offlineDevice, ...snapshot } = profile;
    return { ...snapshot, memberships: [] };
  } catch {
    clearOfflineProfile();
    return null;
  }
}
