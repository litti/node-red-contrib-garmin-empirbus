import type { SwitchState } from 'garmin-empirbus-ts'

type PayloadObject = {
    action?: unknown
    Brightness?: unknown
    On?: unknown
    brightness?: unknown
    percentage?: unknown
    power?: unknown
    rangeValue?: unknown
    state?: {
        action?: unknown
        brightness?: unknown
        percentage?: unknown
        power?: unknown
        rangeValue?: unknown
    }
}

const isObject = (value: unknown): value is PayloadObject =>
    value !== null && typeof value === 'object'

const getState = (payload: unknown): PayloadObject['state'] | undefined => {
    if (!isObject(payload) || !isObject(payload.state))
        return undefined

    return payload.state
}

export const resolvePower = (payload: unknown): SwitchState | undefined => {
    const state = getState(payload)
    const value = state?.power ?? (isObject(payload) ? payload.power ?? payload.On : payload)

    if (typeof value === 'boolean')
        return (value ? 'ON' : 'OFF') as SwitchState

    if (typeof value === 'number') {
        if (value === 1)
            return 'ON' as SwitchState

        if (value === 0)
            return 'OFF' as SwitchState

        return undefined
    }

    if (typeof value !== 'string')
        return undefined

    switch (value.trim().toLowerCase()) {
        case 'on':
        case 'ein':
        case 'true':
        case '1':
            return 'ON' as SwitchState

        case 'off':
        case 'aus':
        case 'false':
        case '0':
            return 'OFF' as SwitchState

        default:
            return undefined
    }
}

export const resolveAction = (payload: unknown): 'press' | 'release' | undefined => {
    const state = getState(payload)
    const value = state?.action ?? (isObject(payload) ? payload.action : payload)

    if (typeof value !== 'string')
        return undefined

    const normalized = value.trim().toLowerCase()

    if (normalized === 'press' || normalized === 'release')
        return normalized

    return undefined
}

export const resolveHomeKitBrightness = (payload: unknown): number | undefined => {
    if (!isObject(payload) || payload.Brightness === undefined)
        return undefined

    const brightness = Number(payload.Brightness)

    if (!Number.isFinite(brightness) || brightness < 0 || brightness > 100)
        throw new Error('HomeKit Brightness must be between 0 and 100.')

    return brightness
}

export const resolveDimPayload = (payload: unknown): unknown => {
    const state = getState(payload)

    if (state) {
        if (state.brightness !== undefined)
            return state.brightness

        if (state.percentage !== undefined)
            return state.percentage

        if (state.rangeValue !== undefined)
            return state.rangeValue

        if (state.power !== undefined)
            return state.power
    }

    if (isObject(payload)) {
        if (payload.Brightness !== undefined)
            return payload.Brightness

        if (payload.brightness !== undefined)
            return payload.brightness

        if (payload.percentage !== undefined)
            return payload.percentage

        if (payload.rangeValue !== undefined)
            return payload.rangeValue

        if (payload.power !== undefined)
            return payload.power

        if (payload.On !== undefined)
            return payload.On
    }

    return payload
}
