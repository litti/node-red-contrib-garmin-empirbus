"use strict";
(() => {
    const controlsSelectors = {
        masterCheckboxSelector: '.empirbus-channel-master-checkbox',
        filterInputSelector: '.empirbus-channel-filter-input'
    };
    const toSelectedIds = (value) => String(value || '')
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
    const createCheckbox = (id, checked) => $('<input type="checkbox">')
        .addClass('empirbus-channel-checkbox')
        .attr('data-channel-id', id)
        .prop('checked', checked);
    const createRow = (channel, selectedIds) => {
        const id = String(channel.id);
        const labelText = channel.description ||
            channel.name ||
            `Channel ${id}`;
        const row = $('<div/>').addClass('empirbus-channel-row');
        const checkbox = createCheckbox(id, selectedIds.includes(id));
        const idLabel = $('<span/>')
            .addClass('empirbus-channel-id')
            .text(id);
        const label = $('<span/>')
            .addClass('empirbus-channel-label')
            .text(labelText);
        row.append(checkbox).append(idLabel).append(label);
        return row;
    };
    const createControls = () => {
        const controls = $('<div/>').addClass('empirbus-channel-controls');
        const masterLabel = $('<label/>').addClass('empirbus-channel-master');
        const masterCheckbox = $('<input type="checkbox">')
            .addClass('empirbus-channel-master-checkbox');
        const masterText = $('<span/>')
            .addClass('empirbus-channel-master-label')
            .text('Alle');
        masterLabel.append(masterCheckbox).append(masterText);
        const filterInput = $('<input type="text">')
            .addClass('empirbus-channel-filter-input')
            .attr('placeholder', 'Filtern…')
            .attr('autocomplete', 'off');
        controls.append(masterLabel).append(filterInput);
        return controls;
    };
    const getVisibleChannelCheckboxes = (containerSelector) => $(`${containerSelector} .empirbus-channel-row:visible input.empirbus-channel-checkbox`);
    const setMasterCheckboxState = (containerSelector) => {
        const master = $(`${containerSelector} ${controlsSelectors.masterCheckboxSelector}`).get(0);
        if (!master)
            return;
        const visibleCheckboxes = getVisibleChannelCheckboxes(containerSelector);
        if (visibleCheckboxes.length === 0) {
            master.checked = false;
            master.indeterminate = false;
            return;
        }
        const checkedCount = visibleCheckboxes.filter(':checked').length;
        master.checked = checkedCount === visibleCheckboxes.length;
        master.indeterminate = checkedCount > 0 && checkedCount < visibleCheckboxes.length;
    };
    const applyFilter = (containerSelector, filterValue) => {
        const query = filterValue.trim().toLowerCase();
        $(`${containerSelector} .empirbus-channel-row`).each(function () {
            const row = $(this);
            const searchableText = row.text().toLowerCase();
            const matches = query.length === 0 || searchableText.includes(query);
            row.toggle(matches);
        });
        setMasterCheckboxState(containerSelector);
    };
    const bindControls = (containerSelector) => {
        const masterSelector = `${containerSelector} ${controlsSelectors.masterCheckboxSelector}`;
        const filterSelector = `${containerSelector} ${controlsSelectors.filterInputSelector}`;
        $(containerSelector)
            .off('change.empirbus', 'input.empirbus-channel-checkbox')
            .on('change.empirbus', 'input.empirbus-channel-checkbox', () => setMasterCheckboxState(containerSelector));
        $(masterSelector)
            .off('change.empirbus')
            .on('change.empirbus', function () {
            const shouldCheck = $(this).is(':checked');
            const visibleCheckboxes = getVisibleChannelCheckboxes(containerSelector);
            visibleCheckboxes.prop('checked', shouldCheck);
            setMasterCheckboxState(containerSelector);
        });
        $(filterSelector)
            .off('input.empirbus')
            .on('input.empirbus', function () {
            applyFilter(containerSelector, String($(this).val() || ''));
        });
        setMasterCheckboxState(containerSelector);
    };
    const renderChannels = (containerSelector, channels, selectedIds) => {
        const container = $(containerSelector);
        container.empty();
        container.append(createControls());
        channels.forEach(channel => {
            container.append(createRow(channel, selectedIds));
        });
        bindControls(containerSelector);
    };
    const loadChannels = ({ configId, containerSelector, selectedIds }) => {
        if (!configId)
            return;
        $.getJSON(`empirbus/${configId}/channels`, (channels) => renderChannels(containerSelector, channels, selectedIds));
    };
    const saveSelectedChannelIds = (containerSelector) => {
        const ids = [];
        $(`${containerSelector} input[type="checkbox"]:checked`).each(function () {
            const id = $(this).attr('data-channel-id');
            if (id)
                ids.push(id);
        });
        $('#node-input-channelIds').val(ids.join(','));
        const acknowledge = $('#node-input-acknowledge').is(':checked');
        $('#node-input-acknowledge').val(acknowledge ? 'true' : 'false');
    };
    const bindConfigChange = ({ node, containerSelector }) => {
        const refresh = () => {
            const configId = String($('#node-input-config').val() || '');
            loadChannels({
                configId,
                containerSelector,
                selectedIds: toSelectedIds(node.channelIds)
            });
        };
        $('#node-input-acknowledge').prop('checked', !!node.acknowledge);
        $('#node-input-config').on('change', refresh);
        refresh();
    };
    window.EmpirbusEditor = {
        bindConfigChange,
        saveSelectedChannelIds
    };
})();
//# sourceMappingURL=empirbus-editor.js.map