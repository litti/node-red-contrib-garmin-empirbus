import type { Channel } from 'garmin-empirbus-ts'

type AlexaState = Record<string, unknown>

const toNumber = (value: unknown) => {
    const n = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(n) ? n : undefined
}

const normalizeText = (value: string) =>
    value.trim().toLowerCase()

const textIncludesAny = (text: string, needles: string[]) =>
    needles.some(n => text.includes(n))

const getKey = (channel: Channel) =>
    normalizeText(`${channel.name || ''} ${channel.description || ''}`)

const parsePercent = (value: unknown) => {
    if (typeof value === 'string') {
        const t = value.trim()
        if (t.endsWith('%')) {
            const n = Number(t.slice(0, -1))
            return Number.isFinite(n) ? n : undefined
        }
    }

    const n = toNumber(value)
    if (n === undefined)
        return undefined

    if (n >= 0 && n <= 100)
        return n

    if (n >= 0 && n <= 1)
        return n * 100

    return undefined
}

const isBinary = (rawValue: number) =>
    rawValue === 0 || rawValue === 1

const toPower = (rawValue: number) =>
    rawValue === 1 ? 'ON' : 'OFF'

const buildTemperatureOrSetPoint = (channel: Channel): AlexaState | null => {
    const value = toNumber(channel.decodedValue)
    if (value === undefined)
        return null

    const key = getKey(channel)
    const isSetPoint = textIncludesAny(key, ['target', 'setpoint', 'soll'])

    if (isSetPoint)
        return { thermostatSetPoint: value }

    return { temperature: value }
}

const buildBrightness = (channel: Channel): AlexaState | null => {
    const percent = parsePercent(channel.decodedValue)
    const raw = channel.rawValue ?? undefined
    const value = percent ?? (typeof raw === 'number' ? raw : undefined)

    if (value === undefined)
        return null

    if (value < 0 || value > 100)
        return null

    return { brightness: Math.round(value), percentage: value }
}

const buildPercentage = (channel: Channel): AlexaState | null => {
    const percent = parsePercent(channel.decodedValue)
    if (percent === undefined)
        return null

    return { percentage: percent }
}

const buildRange = (channel: Channel): AlexaState | null => {
    const decoded = toNumber(channel.decodedValue)
    if (decoded !== undefined)
        return { rangeValue: decoded }

    if (typeof channel.rawValue === 'number')
        return { rangeValue: channel.rawValue }

    return null
}

export const deriveAlexaState = (channel: Channel): AlexaState | null => {
    if (channel.rawValue === null)
        return null

    if (channel.dataItemFormatType === 22)
        return buildTemperatureOrSetPoint(channel)

    const key = getKey(channel)

    if (channel.channelType === 3)
        return buildBrightness(channel)

    if (textIncludesAny(key, ['ambient light', 'awning light', 'slider:']))
        return buildBrightness(channel)

    if (channel.dataItemFormatType === 14)
        return buildPercentage(channel)

    if (textIncludesAny(key, ['value %', 'state of charge', '%']))
        return buildPercentage(channel)

    if (isBinary(channel.rawValue))
        return { power: toPower(channel.rawValue) }

    return buildRange(channel)
}
