const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '..')
const outputDir = path.join(projectRoot, 'public', 'preload', 'bin')
const builds = [
  {
    label: 'bluetooth-helper',
    sourcePath: path.join(projectRoot, 'public', 'preload', 'native', 'bluetooth-helper.swift'),
    outputPath: path.join(outputDir, 'bluetooth-helper'),
    command: '/usr/bin/xcrun',
    args: (sourcePath, outputPath) => [
      'swiftc',
      '-O',
      sourcePath,
      '-framework',
      'Foundation',
      '-framework',
      'IOBluetooth',
      '-o',
      outputPath
    ]
  },
  {
    label: 'sound-helper',
    sourcePath: path.join(projectRoot, 'public', 'preload', 'native', 'sound-helper.swift'),
    outputPath: path.join(outputDir, 'sound-helper'),
    command: '/usr/bin/xcrun',
    args: (sourcePath, outputPath) => [
      'swiftc',
      '-O',
      sourcePath,
      '-framework',
      'CoreAudio',
      '-framework',
      'Foundation',
      '-o',
      outputPath
    ]
  },
  {
    label: 'wifi-helper',
    sourcePath: path.join(projectRoot, 'public', 'preload', 'native', 'wifi-helper.swift'),
    outputPath: path.join(outputDir, 'wifi-helper'),
    command: '/usr/bin/xcrun',
    args: (sourcePath, outputPath) => [
      'swiftc',
      '-O',
      sourcePath,
      '-framework',
      'CoreWLAN',
      '-framework',
      'Foundation',
      '-o',
      outputPath
    ]
  },
  {
    label: 'bluetooth-power',
    sourcePath: path.join(projectRoot, 'public', 'preload', 'native', 'bluetooth-power.m'),
    outputPath: path.join(outputDir, 'bluetooth-power'),
    command: '/usr/bin/cc',
    args: (sourcePath, outputPath) => [
      '-Wall',
      '-Wextra',
      '-Werror',
      '-mmacosx-version-min=10.9',
      '-framework',
      'Foundation',
      '-framework',
      'IOBluetooth',
      sourcePath,
      '-o',
      outputPath
    ]
  }
]

if (process.platform !== 'darwin') {
  console.log('[build-helper] Skipping helper build on non-macOS platform')
  process.exit(0)
}

fs.mkdirSync(outputDir, { recursive: true })

for (const build of builds) {
  if (!fs.existsSync(build.sourcePath)) {
    console.warn(`[build-helper] ${build.label} source not found, skipping build`)
    continue
  }

  const result = spawnSync(
    build.command,
    build.args(build.sourcePath, build.outputPath),
    { stdio: 'inherit' }
  )

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  fs.chmodSync(build.outputPath, 0o755)
  console.log(`[build-helper] Built ${build.outputPath}`)
}
