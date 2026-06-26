const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { buildDistPluginManifest, removeDistTestFiles } = require('./plugin-manifest.cjs')

test('buildDistPluginManifest strips development config from distributed plugin metadata', () => {
  const sourceManifest = {
    main: 'index.html',
    preload: 'preload/services.js',
    development: {
      main: 'http://127.0.0.1:5173/index.html'
    },
    features: [
      {
        code: 'bluetooth',
        cmds: ['蓝牙']
      },
      {
        code: 'sound',
        cmds: ['sound']
      }
    ]
  }

  const distManifest = buildDistPluginManifest(sourceManifest)

  assert.equal(distManifest.development, undefined)
  assert.equal(distManifest.main, 'index.html')
  assert.deepEqual(distManifest.features, sourceManifest.features)
})

test('removeDistTestFiles keeps release output free of copied tests', () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'utools-plus-manifest-'))
  const distRoot = path.join(projectRoot, 'dist')
  const preloadRoot = path.join(distRoot, 'preload')
  const servicesRoot = path.join(preloadRoot, 'services')

  fs.mkdirSync(servicesRoot, { recursive: true })
  fs.writeFileSync(path.join(preloadRoot, 'services.test.js'), '')
  fs.writeFileSync(path.join(servicesRoot, 'sound.test.js'), '')
  fs.writeFileSync(path.join(servicesRoot, 'sound.js'), '')

  const removedFiles = removeDistTestFiles(projectRoot)

  assert.equal(removedFiles.length, 2)
  assert.equal(fs.existsSync(path.join(preloadRoot, 'services.test.js')), false)
  assert.equal(fs.existsSync(path.join(servicesRoot, 'sound.test.js')), false)
  assert.equal(fs.existsSync(path.join(servicesRoot, 'sound.js')), true)
})
