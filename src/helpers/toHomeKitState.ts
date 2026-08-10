type ChannelState = Record<string, unknown>
type HomeKitState = Record<string, unknown>

const toNumber = (value: unknown) => {
    if (typeof value !== 'number')
        return undefined

    return Number.isFinite(value) ? value : undefined
}

const toOn = (state: ChannelState) => {
    if (state.power === 'ON')
        return true

    if (state.power === 'OFF')
        return false

    const brightness = toNumber(state.brightness)
    if (brightness !== undefined)
        return brightness > 0

    return undefined
}

export const toHomeKitState = (state: ChannelState): HomeKitState | null => {
    const on = toOn(state)
    const brightness = toNumber(state.brightness)

    if (brightness !== undefined) {
        if (on === undefined)
            return null

        return {
            On: on,
            Brightness: Math.round(brightness)
        }
    }

    if (on !== undefined)
        return { On: on }

    return null
}
