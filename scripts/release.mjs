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

const quoteForCmd = value => {
    const escaped = value.replace(/"/g, '\\"')
    return `"${escaped}"`
}

const toWindowsCmdInvocation = (cmd, args) => {
    const cmdline = [cmd, ...args].map(quoteForCmd).join(' ')
    return {
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', cmdline]
    }
}

const shouldUseCmdExe = cmd => isWindows() && cmd.toLowerCase().endsWith('.cmd')

const resolveCmd = cmd => {
    if (!isWindows())
        return cmd

    if (cmd === 'npm')
        return 'npm.cmd'

    if (cmd === 'yarn')
        return 'yarn.cmd'

    return cmd
}

const normalizeInvocation = (cmd, args) => {
    const resolved = resolveCmd(cmd)

    if (shouldUseCmdExe(resolved))
        return toWindowsCmdInvocation(resolved, args)

    return { command: resolved, args }
}

const run = (cmd, args, options = {}) => {
    const invocation = normalizeInvocation(cmd, args)

    const result = spawnSync(invocation.command, invocation.args, {
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
    const invocation = normalizeInvocation(cmd, args)

    const result = spawnSync(invocation.command, invocation.args, {
        encoding: 'utf8',
        cwd: projectRoot,
        ...options
    })

    if (result.error)
        return { ok: false, stdout: '', stderr: String(result.error.message || result.error) }

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
    const baseArgs = ['whoami']
    const base = runCapture('npm', baseArgs, { env: npmEnv() })

    if (base.ok)
        return

    const verbose = runCapture('npm', [...baseArgs, '--loglevel', 'verbose'], { env: npmEnv() })
    const details = [base.stderr, base.stdout, verbose.stderr, verbose.stdout]
        .map(value => String(value || '').trim())
        .filter(value => value.length > 0)
        .join('\n')

    throw new Error(`npm whoami failed:\n${details || 'no output from npm'}`)
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
