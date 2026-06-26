const fs = require('node:fs')
const path = require('node:path')

function buildDistPluginManifest (sourceManifest) {
  const { development, ...distManifest } = sourceManifest
  return distManifest
}

function readJsonFile (filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeDistPluginManifest (projectRoot = path.resolve(__dirname, '..')) {
  const sourcePath = path.join(projectRoot, 'public', 'plugin.json')
  const distPath = path.join(projectRoot, 'dist', 'plugin.json')
  const sourceManifest = readJsonFile(sourcePath)
  const distManifest = buildDistPluginManifest(sourceManifest)

  fs.writeFileSync(distPath, `${JSON.stringify(distManifest, null, 2)}\n`)
  return distPath
}

function listFiles (directoryPath) {
  if (!fs.existsSync(directoryPath)) return []

  const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name)

    if (entry.isDirectory()) {
      files.push(...listFiles(entryPath))
      continue
    }

    files.push(entryPath)
  }

  return files
}

function removeDistTestFiles (projectRoot = path.resolve(__dirname, '..')) {
  const distPath = path.join(projectRoot, 'dist')
  const testFiles = listFiles(distPath).filter(filePath => /\.test\.[cm]?js$/.test(filePath))

  for (const filePath of testFiles) {
    fs.rmSync(filePath)
  }

  return testFiles
}

if (require.main === module) {
  const outputPath = writeDistPluginManifest()
  console.log(`[plugin-manifest] Wrote ${outputPath}`)
  const removedFiles = removeDistTestFiles()

  if (removedFiles.length > 0) {
    console.log(`[plugin-manifest] Removed ${removedFiles.length} test files from dist`)
  }
}

module.exports = {
  buildDistPluginManifest,
  removeDistTestFiles,
  writeDistPluginManifest
}
