export const VOLUME_STEP = 5

export function clampPercent (percent) {
  const numericPercent = Number(percent)

  if (!Number.isFinite(numericPercent)) {
    return 0
  }

  return Math.min(100, Math.max(0, Math.round(numericPercent)))
}

export function updateVolumeDraft (drafts, scope, percent) {
  return {
    ...drafts,
    [scope]: clampPercent(percent)
  }
}

export function clearVolumeDraft (drafts, scope) {
  const nextDrafts = { ...drafts }
  delete nextDrafts[scope]
  return nextDrafts
}

export function getVisibleVolumePercent (control, drafts, scope) {
  if (typeof drafts[scope] === 'number') {
    return clampPercent(drafts[scope])
  }

  if (typeof control.volume !== 'number') {
    return 0
  }

  return clampPercent(control.volume * 100)
}
