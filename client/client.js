let isRadioOpen = false;
let isPttPressed = false;
let nuiFocused = false;
let lastPttTime = 0;
let pttPressStartTime = 0;
let currentCodeplug = {};
let inVehicle = false;

const PTT_COOLDOWN_MS = 2000;
const MIN_PTT_DURATION_MS = 500;

function displayStartupMessage() {
    SendNuiMessage({
        type: 'showStartupMessage'
    });
    setTimeout(() => {
        SendNuiMessage({
            type: 'hideStartupMessage'
        });
    }, 5000);
}

on('onClientResourceStart', (resourceName) => {
    if (GetCurrentResourceName() !== resourceName) {
        return;
    }
    displayStartupMessage();
});

RegisterCommand('toggle_radio', () => {
    ToggleRadio();
}, false);

RegisterCommand('set_rid', (source, args) => {
    if (args.length > 0) {
        setRid(args[0]);
    } else {
        console.log('Usage: /set_rid <RID>');
    }
}, false);

onNet('open_radio', () => {
    ToggleRadio();
});

onNet('receiveCodeplug', (codeplug) => {
    console.debug('Received new codeplug:', codeplug);
    currentCodeplug = codeplug;
    SetResourceKvp('currentCodeplug', JSON.stringify(currentCodeplug));
});

RegisterNuiCallbackType('unFocus');
on('__cfx_nui:unFocus', (data, cb) => {
    console.debug("Set NUI focus to false");
    SetNuiFocus(false, false);
    cb({});
});

RegisterKeyMapping('toggle_radio', 'Toggle Radio', 'keyboard', 'Y');
RegisterKeyMapping('toggle_radio_focus', 'Toggle Radio Focus', 'keyboard', ']');
RegisterKeyMapping('+ptt', 'Push-To-Talk', 'keyboard', 'N');

RegisterCommand('+ptt', () => {
    handlePTTDown();
}, false);

RegisterCommand('-ptt', () => {
    handlePTTUp();
}, false);

RegisterCommand('toggle_radio_focus', () => {
    console.debug("Current NUI focus state:", nuiFocused);
    if (!nuiFocused) {
        console.debug("Setting NUI focus to true");
        nuiFocused = true;
        SetNuiFocus(true, true);
    } else {
        console.debug("Setting NUI focus to false");
        nuiFocused = false;
        SetNuiFocus(false, false);
    }
}, false);

function ToggleRadio() {
    if (isRadioOpen) {
        CloseRadio();
    } else {
        OpenRadio();
    }
}

function OpenRadio() {
    console.debug('Open radio command received');
    const codeplug = JSON.parse(GetResourceKvpString('currentCodeplug'));
    console.log(GetResourceKvpString('currentCodeplug'));
    currentCodeplug = codeplug;
    if (codeplug === undefined || codeplug === null) {
        console.debug('No codeplug loaded');
        return;
    }
    SendNuiMessage(JSON.stringify({ type: 'openRadio', codeplug }));
    SendNuiMessage(JSON.stringify({ type: 'setRid', rid: GetResourceKvpString('myRid') }));
    SetNuiFocus(false, false);
    isRadioOpen = true;
}

function CloseRadio() {
    SendNuiMessage(JSON.stringify({ type: 'closeRadio' }));
    SetNuiFocus(false, false);
    isRadioOpen = false;
}

function handlePTTDown() {
    const currentTime = Date.now();
    const timeSinceLastPtt = currentTime - lastPttTime;

    if (!isPttPressed && timeSinceLastPtt > PTT_COOLDOWN_MS) {
        if (timeSinceLastPtt < MIN_PTT_DURATION_MS) {
            console.debug('PTT press ignored due to short press duration');
            return;
        }
        console.debug('PTT pressed');
        SendNuiMessage(JSON.stringify({ type: 'pttPress' }));
        isPttPressed = true;
        pttPressStartTime = currentTime;
    } else {
        console.debug('PTT press ignored due to cooldown');
    }
}

function handlePTTUp() {
    const currentTime = Date.now();
    const pressDuration = currentTime - pttPressStartTime;

    if (isPttPressed) {
        if (pressDuration >= MIN_PTT_DURATION_MS) {
            console.debug('PTT released');
            SendNuiMessage(JSON.stringify({ type: 'pttRelease' }));
            lastPttTime = currentTime;
        } else {
            console.debug('PTT release ignored due to short press duration');
        }
        isPttPressed = false;
    }
}

setTick(async () => {
    if (currentCodeplug && currentCodeplug.radioWide && currentCodeplug.radioWide.model) {
        if (IsPedInAnyVehicle(PlayerPedId(), false)) {
            if (!inVehicle) {
                inVehicle = true;
                SendNuiMessage(JSON.stringify({type: 'setModel', model: currentCodeplug.radioWide.inCarMode}));
            }
        } else {
            if (inVehicle) {
                inVehicle = false;
                console.debug('Sending Setting model to:', currentCodeplug.radioWide.model);
                SendNuiMessage(JSON.stringify({type: 'setModel', model: currentCodeplug.radioWide.model}));
            }
        }
    }
    await Wait(0);
});

function setRid(newRid) {
    myRid = newRid;
    SetResourceKvp('myRid', myRid);
    SendNuiMessage(JSON.stringify({ type: 'setRid', rid: GetResourceKvpString('myRid') }));
}