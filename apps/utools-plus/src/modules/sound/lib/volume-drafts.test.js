import test from 'node:test'
import assert from 'node:assert/strict'

import {
  VOLUME_STEP,
  clampPercent,
  clearVolumeDraft,
  getVisibleVolumePercent,
  updateVolumeDraft
} from './volume-drafts.js'

test('VOLUME_STEP uses five percent increments for sound controls', () => {
  assert.equal(VOLUME_STEP, 5)
})

test('clampPercent keeps slider values in a stable 0-100 range', () => {
  assert.equal(clampPercent(-12.4), 0)
  assert.equal(clampPercent(24.6), 25)
  assert.equal(clampPercent(140), 100)
})

test('updateVolumeDraft records local slider movement without changing other scopes', () => {
  assert.deepEqual(updateVolumeDraft({ input: 20 }, 'output', 42.2), {
    input: 20,
    output: 42
  })
})

test('getVisibleVolumePercent prefers the local draft while the slider is being dragged', () => {
  assert.equal(
    getVisibleVolumePercent(
      {
        volume: 0.25
      },
      {
        output: 61
      },
      'output'
    ),
    61
  )
})

test('getVisibleVolumePercent falls back to the last system snapshot when there is no draft', () => {
  assert.equal(
    getVisibleVolumePercent(
      {
        volume: 0.25
      },
      {},
      'output'
    ),
    25
  )
})

test('clearVolumeDraft removes only the committed slider draft', () => {
  assert.deepEqual(clearVolumeDraft({ input: 15, output: 70 }, 'output'), {
    input: 15
  })
})
