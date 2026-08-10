type ChannelState = Record<string, unknown>
type AlexaState = Record<string, unknown>

const toNumber = (value: unknown) => {
    if (typeof value !== 'number')
        return undefined

    return Number.isFinite(value) ? value : undefined
}

const toPower = (value: unknown) =>
    value === 'ON' || value === 'OFF' ? value : undefined

export const toAlexaState = (state: ChannelState): AlexaState | null => {
    const power = toPower(state.power)
    const brightness = toNumber(state.brightness)

    if (brightness !== undefined) {
        const alexaState: AlexaState = { brightness: Math.round(brightness) }

        if (power !== undefined)
            alexaState.power = power

        return alexaState
    }

    if (power !== undefined)
        return { power }

    const thermostatSetPoint = toNumber(state.thermostatSetPoint)
    if (thermostatSetPoint !== undefined)
        return { thermostatSetPoint }

    const temperature = toNumber(state.temperature)
    if (temperature !== undefined)
        return { temperature }

    const percentage = toNumber(state.percentage)
    if (percentage !== undefined)
        return { percentage }

    return null
}
