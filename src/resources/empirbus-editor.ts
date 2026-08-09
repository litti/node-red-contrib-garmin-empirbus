(() => {
    type Channel = {
        id: string | number
        name?: string
        description?: string
    }

    type BindOptions = {
        node: {
            config?: string
            channelIds?: string
            acknowledge?: boolean
            outputs?: number
        }
        containerSelector: string
    }

    type LoadOptions = {
        configId: string | undefined
        containerSelector: string
        selectedIds: string[]
    }

    type ControlsSelectors = {
        masterCheckboxSelector: string
        filterInputSelector: string
    }

    const controlsSelectors: ControlsSelectors = {
        masterCheckboxSelector: '.empirbus-channel-master-checkbox',
        filterInputSelector: '.empirbus-channel-filter-input'
    }

    const editorStyles = `
        .empirbus-channel-controls {
            display: grid;
            grid-template-columns: auto minmax(140px, 1fr);
            align-items: center;
            gap: 12px;
            margin-bottom: 8px;
        }

        .empirbus-channel-master {
            display: inline-flex !important;
            align-items: center;
            gap: 7px;
            width: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            white-space: nowrap;
        }

        .empirbus-channel-master-label {
            line-height: 20px;
        }

        .empirbus-channel-filter-input {
            box-sizing: border-box;
            width: 100% !important;
            min-width: 0;
            margin: 0 !important;
        }

        .empirbus-channel-row {
            display: grid;
            grid-template-columns: 22px 44px minmax(0, 1fr);
            align-items: center;
            column-gap: 8px;
            min-height: 28px;
            padding: 2px 0;
        }

        .empirbus-channel-checkbox,
        .empirbus-channel-master-checkbox {
            box-sizing: border-box !important;
            width: 16px !important;
            min-width: 16px !important;
            max-width: 16px !important;
            height: 16px !important;
            min-height: 16px !important;
            margin: 0 !important;
            padding: 0 !important;
            justify-self: center;
            flex: none !important;
        }

        .empirbus-channel-id {
            display: block;
            width: 44px;
            text-align: right;
            font-variant-numeric: tabular-nums;
            font-weight: 600;
            opacity: .72;
        }

        .empirbus-channel-label {
            display: block;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    `

    const ensureStyles = (): void => {
        if (document.getElementById('empirbus-editor-styles'))
            return

        $('<style/>', {
            id: 'empirbus-editor-styles',
            text: editorStyles
        }).appendTo('head')
    }

    const toSelectedIds = (value?: string): string[] =>
        String(value || '')
            .split(',')
            .map(entry => entry.trim())
            .filter(Boolean)

    const createCheckbox = (id: string, checked: boolean): JQuery =>
        $('<input type="checkbox">')
            .addClass('empirbus-channel-checkbox')
            .attr('data-channel-id', id)
            .prop('checked', checked)

    const createRow = (channel: Channel, selectedIds: string[]): JQuery => {
        const id = String(channel.id)
        const labelText = channel.description || channel.name || `Channel ${id}`
        const row = $('<div/>').addClass('empirbus-channel-row')
        const checkbox = createCheckbox(id, selectedIds.includes(id))
        const idLabel = $('<span/>').addClass('empirbus-channel-id').text(id)
        const label = $('<span/>').addClass('empirbus-channel-label').text(labelText)

        row.append(checkbox).append(idLabel).append(label)

        return row
    }

    const createControls = (): JQuery => {
        const controls = $('<div/>').addClass('empirbus-channel-controls')
        const masterLabel = $('<label/>').addClass('empirbus-channel-master')
        const masterCheckbox = $('<input type="checkbox">').addClass('empirbus-channel-master-checkbox')
        const masterText = $('<span/>').addClass('empirbus-channel-master-label').text('Alle')
        const filterInput = $('<input type="text">')
            .addClass('empirbus-channel-filter-input')
            .attr('placeholder', 'Filtern…')
            .attr('autocomplete', 'off')

        masterLabel.append(masterCheckbox).append(masterText)
        controls.append(masterLabel).append(filterInput)

        return controls
    }

    const getVisibleChannelCheckboxes = (containerSelector: string): JQuery =>
        $(`${containerSelector} .empirbus-channel-row:visible input.empirbus-channel-checkbox`)

    const setMasterCheckboxState = (containerSelector: string): void => {
        const master = $(
            `${containerSelector} ${controlsSelectors.masterCheckboxSelector}`
        ).get(0) as HTMLInputElement | undefined

        if (!master)
            return

        const visibleCheckboxes = getVisibleChannelCheckboxes(containerSelector)

        if (visibleCheckboxes.length === 0) {
            master.checked = false
            master.indeterminate = false
            return
        }

        const checkedCount = visibleCheckboxes.filter(':checked').length

        master.checked = checkedCount === visibleCheckboxes.length
        master.indeterminate = checkedCount > 0 && checkedCount < visibleCheckboxes.length
    }

    const applyFilter = (containerSelector: string, filterValue: string): void => {
        const query = filterValue.trim().toLowerCase()

        $(`${containerSelector} .empirbus-channel-row`).each(function () {
            const row = $(this)
            const searchableText = row.text().toLowerCase()
            const matches = query.length === 0 || searchableText.includes(query)
            row.toggle(matches)
        })

        setMasterCheckboxState(containerSelector)
    }

    const bindControls = (containerSelector: string): void => {
        const masterSelector = `${containerSelector} ${controlsSelectors.masterCheckboxSelector}`
        const filterSelector = `${containerSelector} ${controlsSelectors.filterInputSelector}`

        $(containerSelector)
            .off('change.empirbus', 'input.empirbus-channel-checkbox')
            .on('change.empirbus', 'input.empirbus-channel-checkbox', () =>
                setMasterCheckboxState(containerSelector)
            )

        $(masterSelector)
            .off('change.empirbus')
            .on('change.empirbus', function () {
                const shouldCheck = $(this).is(':checked')
                const visibleCheckboxes = getVisibleChannelCheckboxes(containerSelector)
                visibleCheckboxes.prop('checked', shouldCheck)
                setMasterCheckboxState(containerSelector)
            })

        $(filterSelector)
            .off('input.empirbus')
            .on('input.empirbus', function () {
                applyFilter(containerSelector, String($(this).val() || ''))
            })

        setMasterCheckboxState(containerSelector)
    }

    const renderChannels = (containerSelector: string, channels: Channel[], selectedIds: string[]): void => {
        ensureStyles()

        const container = $(containerSelector)
        container.empty()
        container.append(createControls())

        channels.forEach(channel => {
            container.append(createRow(channel, selectedIds))
        })

        bindControls(containerSelector)
    }

    const loadChannels = ({ configId, containerSelector, selectedIds }: LoadOptions): void => {
        if (!configId)
            return

        $.getJSON(
            `empirbus/${configId}/channels`,
            (channels: Channel[]) => renderChannels(containerSelector, channels, selectedIds)
        )
    }

    const saveSelectedChannelIds = (containerSelector: string): void => {
        const ids: string[] = []

        $(`${containerSelector} input[type="checkbox"]:checked`).each(function () {
            const id = $(this).attr('data-channel-id')
            if (id)
                ids.push(id)
        })

        $('#node-input-channelIds').val(ids.join(','))

    }


    type EditorNode = {
        id?: string
        type?: string
        config?: string
        dirty?: boolean
    }

    type EditorApi = {
        events: {
            on: (event: string, handler: (node: EditorNode) => void) => void
        }
        nodes: {
            eachConfig: (callback: (node: EditorNode) => void) => void
            dirty: (dirty: boolean) => void
        }
        view: {
            redraw: () => void
        }
    }

    type EditorWindow = Window & {
        RED: EditorApi
        EmpirbusEditorConfigAutoAssignmentRegistered?: boolean
    }

    const editorWindow = window as unknown as EditorWindow

    const assignSingleConfig = (node: EditorNode): boolean => {
        if (node.config)
            return false

        const configs: EditorNode[] = []

        editorWindow.RED.nodes.eachConfig(configNode => {
            if (configNode.type === 'empirbus-config')
                configs.push(configNode)
        })

        if (configs.length !== 1 || !configs[0].id)
            return false

        node.config = configs[0].id
        return true
    }

    const registerSingleConfigAutoAssignment = (): void => {
        if (editorWindow.EmpirbusEditorConfigAutoAssignmentRegistered)
            return

        editorWindow.EmpirbusEditorConfigAutoAssignmentRegistered = true

        editorWindow.RED.events.on('nodes:add', node => {
            if (!node.type?.startsWith('empirbus-') || node.type === 'empirbus-config')
                return

            if (!assignSingleConfig(node))
                return

            node.dirty = true
            editorWindow.RED.nodes.dirty(true)
            editorWindow.RED.view.redraw()
        })
    }

    const bindAcknowledgeOutput = (node: { acknowledge?: boolean }): void => {
        const acknowledgeInput = $('#node-input-acknowledge')
        const outputsInput = $('#node-input-outputs')

        if (acknowledgeInput.length === 0 || outputsInput.length === 0)
            return

        const syncOutputs = (): void => {
            outputsInput.val(acknowledgeInput.is(':checked') ? '1' : '0')
        }

        acknowledgeInput
            .prop('checked', !!node.acknowledge)
            .off('change.empirbus-output')
            .on('change.empirbus-output', syncOutputs)

        syncOutputs()
    }

    const bindConfigChange = ({ node, containerSelector }: BindOptions): void => {
        ensureStyles()

        if (assignSingleConfig(node))
            $('#node-input-config').val(String(node.config || '')).trigger('change')

        const refresh = (): void => {
            const configId = String($('#node-input-config').val() || '')

            loadChannels({
                configId,
                containerSelector,
                selectedIds: toSelectedIds(node.channelIds)
            })
        }

        bindAcknowledgeOutput(node)
        $('#node-input-config').on('change', refresh)
        refresh()
    }

    registerSingleConfigAutoAssignment()

    ;(window as unknown as {
        EmpirbusEditor: {
            assignSingleConfig: typeof assignSingleConfig
            bindConfigChange: typeof bindConfigChange
            bindAcknowledgeOutput: typeof bindAcknowledgeOutput
            saveSelectedChannelIds: typeof saveSelectedChannelIds
        }
    }).EmpirbusEditor = {
        assignSingleConfig,
        bindConfigChange,
        bindAcknowledgeOutput,
        saveSelectedChannelIds
    }
})()
