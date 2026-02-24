import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const getProjectRoot = () => {
    const filename = fileURLToPath(import.meta.url)
    const scriptsDir = dirname(filename)
    return resolve(scriptsDir, '..')
}

const projectRoot = getProjectRoot()
const userconfig = resolve(projectRoot, '.npmrc')

const run = (cmd, args, options = {}) => {
    const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true, ...options })

    if (result.error) {
        throw result.error
    }

    if (typeof result.status === 'number' && result.status !== 0) {
        throw new Error(`${cmd} ${args.join(' ')} failed with status ${result.status}`)
    }

    if (result.signal) {
        throw new Error(`${cmd} ${args.join(' ')} was terminated by signal ${result.signal}`)
    }
}

const runCapture = (cmd, args) => {
    const result = spawnSync(cmd, args, { encoding: 'utf8', shell: true })
    const stdout = (result.stdout || '').trim()
    const stderr = (result.stderr || '').trim()

    return {
        ok: result.status === 0,
        stdout,
        stderr
    }
}

const ensureCleanGit = () => {
    const status = runCapture('git', ['status', '--porcelain'])
    if (!status.ok) {
        throw new Error('git status failed')
    }
    if (status.stdout.trim().length > 0) {
        throw new Error('Git working tree is not clean. Commit or stash your changes first.')
    }
}

const bumpVersion = level => {
    run('npm', ['version', level])
}

const build = () => {
    run('yarn', ['build'])
}

const ensureAuth = () => {
    const whoami = runCapture('npm', ['whoami', '--userconfig', userconfig])

    if (whoami.ok)
        return

    const details = whoami.stderr || whoami.stdout || 'unknown error'
    throw new Error(`npm whoami failed: ${details}`)
}

const publish = () => {
    run('npm', ['publish', '--userconfig', userconfig])
}

const main = () => {
    const level = process.argv[2]
    const allowed = new Set(['patch', 'minor', 'major'])

    if (!allowed.has(level)) {
        throw new Error('Usage: node scripts/release.mjs <patch|minor|major>')
    }

    ensureCleanGit()
    bumpVersion(level)
    build()
    ensureAuth()
    publish()
}

try {
    main()
} catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(message)
    process.exit(1)
}
