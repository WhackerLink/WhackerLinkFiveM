let isRadioOpen = false;
let isPttPressed = false;
let lastPttTime = 0;
let pttPressStartTime = 0;

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

onNet('open_radio', () => {
    ToggleRadio();
});

RegisterKeyMapping('toggle_radio', 'Toggle Radio', 'keyboard', 'Y');
RegisterKeyMapping('+ptt', 'Push-To-Talk', 'keyboard', 'N');

RegisterCommand('+ptt', () => {
    handlePTTDown();
}, false);

RegisterCommand('-ptt', () => {
    handlePTTUp();
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
    SendNuiMessage(JSON.stringify({ type: 'openRadio' }));
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
    await Wait(0);
});