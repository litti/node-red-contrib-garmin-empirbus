import { spawnSync } from 'node:child_process'

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
    const result = spawnSync(cmd, args, { encoding: 'utf8' })
    if (result.status !== 0) {
        return { ok: false, stdout: result.stdout || '', stderr: result.stderr || '' }
    }
    return { ok: true, stdout: result.stdout || '', stderr: result.stderr || '' }
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
    const whoami = runCapture('npm', ['whoami'])
    if (whoami.ok) return

    if (process.env.NODE_AUTH_TOKEN && process.env.NODE_AUTH_TOKEN.length > 0) {
        throw new Error('NODE_AUTH_TOKEN is set but npm whoami failed. Token might be invalid for this registry.')
    }

    throw new Error('Not logged in to npm. Run `npm login` or set NODE_AUTH_TOKEN.')
}

const publish = () => {
    run('npm', ['publish'])
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
