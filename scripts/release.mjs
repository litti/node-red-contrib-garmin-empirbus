import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const registry = 'https://registry.npmjs.org/'

const getProjectRoot = () => {
    const filename = fileURLToPath(import.meta.url)
    const scriptsDir = dirname(filename)
    return resolve(scriptsDir, '..')
}

const projectRoot = getProjectRoot()
const userconfig = resolve(projectRoot, '.npmrc')

const isWindows = () => process.platform === 'win32'

const resolveCmd = cmd => {
    if (!isWindows())
        return cmd

    if (cmd === 'npm')
        return 'npm.cmd'

    if (cmd === 'yarn')
        return 'yarn.cmd'

    if (cmd === 'git')
        return 'git.exe'

    return cmd
}

const run = (cmd, args, options = {}) => {
    const result = spawnSync(resolveCmd(cmd), args, {
        stdio: 'inherit',
        cwd: projectRoot,
        ...options
    })

    if (result.error)
        throw result.error

    if (typeof result.status === 'number' && result.status !== 0)
        throw new Error(`${cmd} ${args.join(' ')} failed with status ${result.status}`)

    if (result.signal)
        throw new Error(`${cmd} ${args.join(' ')} was terminated by signal ${result.signal}`)
}

const runCapture = (cmd, args, options = {}) => {
    const result = spawnSync(resolveCmd(cmd), args, {
        encoding: 'utf8',
        cwd: projectRoot,
        ...options
    })

    const stdout = String(result.stdout || '').trim()
    const stderr = String(result.stderr || '').trim()

    return {
        ok: result.status === 0,
        stdout,
        stderr
    }
}

const npmEnv = () => ({
    ...process.env,
    npm_config_userconfig: userconfig,
    npm_config_registry: registry
})

const ensureCleanGit = () => {
    const status = runCapture('git', ['status', '--porcelain'])
    if (!status.ok)
        throw new Error('git status failed')

    if (status.stdout.length > 0)
        throw new Error('Git working tree is not clean. Commit or stash your changes first.')
}

const ensureAuth = () => {
    const whoami = runCapture('npm', ['whoami'], { env: npmEnv() })
    if (whoami.ok)
        return

    const details = whoami.stderr || whoami.stdout || 'unknown error'
    throw new Error(`npm whoami failed: ${details}`)
}

const bumpVersion = level => {
    run('npm', ['version', level], { env: npmEnv() })
}

const build = () => {
    run('yarn', ['build'])
}

const publish = () => {
    run('npm', ['publish'], { env: npmEnv() })
}

const getLevel = () => {
    const level = process.argv[2]
    const allowed = new Set(['patch', 'minor', 'major'])

    if (!allowed.has(level))
        throw new Error('Usage: node scripts/release.mjs <patch|minor|major>')

    return level
}

const main = () => {
    const level = getLevel()
    ensureCleanGit()
    ensureAuth()
    bumpVersion(level)
    build()
    publish()
}

try {
    main()
} catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(message)
    process.exit(1)
}
