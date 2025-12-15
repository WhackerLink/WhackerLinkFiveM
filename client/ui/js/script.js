/*
* WhackerLink - WhackerLinkFiveM
*
* This program is free software: you can redistribute it and/or modify
* it under the terms of the GNU General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* This program is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU General Public License for more details.
*
* You should have received a copy of the GNU General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* Copyright (C) 2024-2025 Caleb, K4PHP
*
*/

const pcmPlayer = new PCMPlayer({encoding: '16bitInt', channels: 1, sampleRate: 8000});
const micCapture = new MicCapture(onAudioFrameReady);

const EXPECTED_PCM_LENGTH = 1600;
const MAX_BUFFER_SIZE = EXPECTED_PCM_LENGTH * 2;

const FREQUENCY_TOLERANCE = 10;
const FREQ_MATCH_THRESHOLD = 5;
const AUDIO_TIMEOUT_MS = 3000;

const HOST_VERSION = "R03.01.00";

const FNE_ID = 0xFFFFFC

const beepAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

const rssiIcon = document.getElementById('rssi-icon');
const scanIcon = document.getElementById('scan-icon');
const redIcon = document.getElementById('red-icon');
const yellowIcon = document.getElementById('yellow-icon');
const greenIcon = document.getElementById('green-icon');
const rxBox = document.getElementById("rx-box");
const txBox = document.getElementById("tx-box");

let socket;
let scanManager;
let currentChannelIndex = 0;
let currentZoneIndex = 0;
let currentFrequncyChannel;
let currentCodeplug;
let isInRange = false;
let fringVC = false;
let isInSiteTrunking = false;
let isTxing = false;
let audioBuffer = [];
let radioOn = false;
let currentMessageIndex = 0;
let toneHistory = [];
let lastTone = null;
let toneStartTime = null;
let lastAudioTime = Date.now();

let isAffiliated = false;
let isRegistered = false;
let isVoiceGranted = false;
let isVoiceRequested = false;
let isVoiceGrantHandled = false;
let isReceiving = false;
let scanTgActive = false;
let isReceivingParkedChannel = false;

let affiliationCheckInterval;
let registrationCheckInterval;
let groupGrantCheckInterval;
let batteryLevelInterval;
let reconnectInterval;
let locationBroadcastInterval;
let toneWatchdogInterval;
let audioWatchdogInterval;

let myRid = "1234";
let currentTg = "2001";
let scanTg = "";
let radioModel;
let currentRssiLevel = "0";
let currentDbLevel;
let batteryLevel = 4;
let currentSite;
let initialized = false;
let haltAllLine3Messages = false;
let scanEnabled = false;
let error = null;
let volumeLevel = 1.0;

let currentLat = null;
let currentLng = null;

let inhibited = false;

function socketOpen() {
    return socket && socket.readyState === WebSocket.OPEN;
}

let beepVolumeReduction = 0.6; // default value
let isResponsiveVoiceApiKeySet = false; // default value
fetch('/configs/config.yml')
  .then(response => response.text())
  .then(yamlText => {
    const lines = yamlText.split('\n');
    for (const line of lines) {
      const matchBeepVolume = line.match(/^\s*beepVolumeReduction\s*:\s*([0-9.]+)\s*$/i);
      const matchApiKeyValue = line.match(/^\s*responsiveVoiceApiKey\s*:\s+\S*$/i);
      if (matchBeepVolume) {
        let parsed = parseFloat(matchBeepVolume[1]);
        if (isNaN(parsed)) {
          console.error('beepVolumeReduction in config.yml is not a number. Using default value.');
          return;
        } if (parsed < 0.0) {
          console.error('beepVolumeReduction in config.yml is less than 0. Clamping to 0.');
          beepVolumeReduction = 0.0;
        } else if (parsed > 1.0) {
          console.error('beepVolumeReduction in config.yml is greater than 1. Clamping to 1.');
          beepVolumeReduction = 1.0;
        } else {
          beepVolumeReduction = parsed;
        }
      }
      if (matchApiKeyValue) {
        let apiKey = matchApiKeyValue.replace("responsiveVoiceApiKey: ", "");
        if (apiKey !== null && apiKey !== "") {
          isResponsiveVoiceApiKeySet = true
          console.log('Responsive voice enabled')
        } else {
          console.log('Responsive voice API key not set, disabled')
        }
      }
    }
  })
  .catch(err => {
    console.warn('Could not load config.yml, using default config values:', err);
  });


reconnectInterval = setInterval(() => {
    if (isInSiteTrunking && radioOn) {
        connectWebSocket();
    }
}, 2000);

batteryLevelInterval = setInterval(() => {
    if (!radioOn || isMobile()) {
        return;
    }

    setBatteryLevel();

    // console.log(`Battery level: ${batteryLevel}`);
}, 3600000);

function isMobile() {
    return radioModel === "APX4500" || radioModel === "E5" || radioModel === "XTL2500" || radioModel === "APX4500-G";
}

function isScannerModel() {
    return radioModel === "UNIG5";
}

function setBatteryLevel() {
    if (batteryLevel > 0) {
        batteryLevel--;
        document.getElementById("battery-icon").src = `models/${radioModel}/icons/battery${batteryLevel}.png`;
    } else {
        powerOff().then();
    }
}

function startToneWatchdogLoop() {
    toneWatchdogInterval = setInterval(() => {
        const now = Date.now();

        if (lastTone && toneStartTime) {
            const duration = now - toneStartTime;

            if (duration >= 2500 && duration <= 4000) {
                //console.log(`forcing flush of tone ${lastTone} after ${duration} ms`);
                toneHistory.push({ freq: lastTone, duration });
                detectQC2Pair();

                lastTone = null;
                toneStartTime = null;
            }
        }
    }, 200);
}

function startCheckLoop() {
    if (!socketOpen() || !isInRange || !radioOn || inhibited) {
        return;
    }

    audioWatchdogInterval = setInterval(() => {
        const now = Date.now();
        if (now - lastAudioTime > AUDIO_TIMEOUT_MS && (isReceivingParkedChannel || scanTgActive)) {
            console.warn("AUDIO WATCHDOG; no valid audio detected in the last 3000 ms, forcing GRP_VCH_RLS logic");
            isVoiceGranted = false;
            isVoiceRequested = false;
            isTxing = false;
            isReceiving = false;
            isReceivingParkedChannel = false;
            document.getElementById("line3").innerHTML = '';
            document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
            redIcon.style.display = 'none';
            txBox.style.display = "none";
            pcmPlayer.clear();
        }
    }, 1000);

    setTimeout(() => {
        sendRegistration().then(() => {
            setTimeout(() => {
                if (isRegistered) {
                    sendAffiliation().then(() => {
                    });
                } else {
                    setLine3('Sys reg refusd');
                }
            }, 800);
        });
    }, 2000);

    locationBroadcastInterval = setInterval(() => {
        if (!socketOpen() || !isInRange || !radioOn || !isRegistered) {
            return;
        }

        fetch(`https://${GetParentResourceName()}/getPlayerLocation`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        }).then();

        if (currentLat !== null && currentLng !== null) {
            SendLocBcast();
        }
    }, 8000);

    affiliationCheckInterval = setInterval(() => {
        if (!socketOpen() || !isInRange || !radioOn) {
            return;
        }

        if (!isAffiliated && isRegistered) {
            sendAffiliation().then(() => {
            });
        }
    }, 5000);

    let clearedDisplay = false;

    registrationCheckInterval = setInterval(() => {
        if (!socketOpen() || !isInRange || !radioOn) {
            return;
        }

        if (!isRegistered) {
            sendRegistration().then();
            if (!haltAllLine3Messages) {
                haltAllLine3Messages = true;
                setTimeout(() => {
                    if (!isRegistered) {
                        setLine3('Sys reg refusd');
                    }
                }, 800);
            }
        } else {
            if (!clearedDisplay) {
                clearedDisplay = true;
                haltAllLine3Messages = false;
                setLine3();
            }
        }
    }, 5000);
}

function stopCheckLoop() {
    clearInterval(audioWatchdogInterval);
    clearInterval(affiliationCheckInterval);
    clearInterval(registrationCheckInterval);
    clearInterval(groupGrantCheckInterval);
    clearInterval(locationBroadcastInterval);
}

async function sendAffiliation() {
    if (isScannerModel())
        return;

    try {
        if (radioModel === "APXNext") {
            document.getElementById("tx-box").style.display = "block"; // Show TX box
            document.getElementById("rx-box").style.display = "none";
        }

        rssiIcon.src = `models/${radioModel}/icons/tx.png`;
        if (isMobile() && radioModel !== "E5" && radioModel !== "APX4500-G") { // E5 temp fix
            redIcon.src = `models/${radioModel}/icons/red.png`;
            redIcon.style.display = 'block';
        }

        await SendGroupAffiliationRequest();
        setTimeout(() => {
            rssiIcon.src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
            if (isMobile()) redIcon.style.display = 'none';
            if (radioModel === "APXNext") {
                document.getElementById("tx-box").style.display = "none";
                document.getElementById("rx-box").style.display = "none";
            }
        }, 75);
    } catch (error) {
        powerOff().then();
        setLine2("Fail 01/01");
        console.error('Error sending affiliation:', error);
    }
}

async function sendRegistration() {
    if (isScannerModel())
        return;

    try {
        if (radioModel === "APXNext") {
            txBox.backgroundColor = 'red';
            document.getElementById("tx-box").style.display = "block";
            document.getElementById("rx-box").style.display = "none";
        }

        rssiIcon.src = `models/${radioModel}/icons/tx.png`;
        if (isMobile() && radioModel !== "E5" && radioModel !== "APX4500-G") { // E5 temp fix
            redIcon.src = `models/${radioModel}/icons/red.png`;
            redIcon.style.display = 'block';
        }
        await SendRegistrationRequest();
        setTimeout(() => {
            rssiIcon.src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
            if (isMobile()) redIcon.style.display = 'none';
            if (radioModel === "APXNext") {
                document.getElementById("tx-box").style.display = "none";
                document.getElementById("rx-box").style.display = "none";
            }
        }, 75);
    } catch (error) {
        console.error('Error sending registration:', error);
    }
}

window.addEventListener('message', async function (event) {
    const deniedWhenOff = ['volumeUp', 'volumeDown', 'channelUp', 'channelDown', 'zoneUp', 'zoneDown', 'pttPress', 'pttRelease', 'resetBatteryLevel', 'activate_emergency'];
    if (!radioOn && deniedWhenOff.includes(event.data.type)) {
        return;
    }
    if (event.data.type === 'resetBatteryLevel'){
        batteryLevel = 4;
    } else if (event.data.type === 'powerToggle') {
        if (radioOn) {
            powerOff().then();
        } else {
            powerOn().then();
        }
    } else if (event.data.type === 'volumeUp') {
        volumeUp();
    } else if (event.data.type === 'volumeDown') {
        volumeDown();
    } else if (event.data.type === 'channelUp') {
        changeChannel(1);
    } else if (event.data.type === 'channelDown') {
        changeChannel(-1);
    } else if (event.data.type === 'zoneUp') {
        changeZone(1);
    } else if (event.data.type === 'zoneDown') {
        changeZone(-1);
    } else if (event.data.type === 'openRadio') {
        currentCodeplug = event.data.codeplug;

        scanManager = new ScanManager(currentCodeplug);

        if (!radioOn) {
            rssiIcon.style.display = 'none';
        }

        if (currentCodeplug === null || currentCodeplug === undefined) {
            radioModel = "APX6000";
            console.log("DEFAULT MODEL SET");
        } else {
            if (radioModel == null) {
                radioModel = currentCodeplug.radioWide.model;
            }
        }

        loadUIState();
        loadRadioModelAssets(radioModel);

        document.getElementById('radio-container').style.display = 'block';
    } else if (event.data.type === 'closeRadio') {
        document.getElementById('radio-container').style.display = 'none';
    } else if (event.data.type === "pttPress") {
        if (isScannerModel())
            return;

        if (!isInRange) {
            console.debug("Not in range, not txing");
            bonk();
            return;
        }

        if (!isRegistered) {
            console.log("Not registered, not txing");
            bonk();
            SendRegistrationRequest();
            return;
        }

        if (currentCodeplug.zones[currentZoneIndex].channels[currentChannelIndex].isReceiveOnly === true) {
            console.debug("Cannot tx, rx only");
            bonk();
            return;
        }

        if (isReceiving) {
            console.debug("Receiving, not txing");
            bonk();
            return;
        }

        if (isVoiceGrantHandled) {
            console.debug("already handled, not txing");
            document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
            bonk();
            return;
        }

        isVoiceGrantHandled = true;

        if (!isInSiteTrunking) {
            document.getElementById("rssi-icon").src = `models/${radioModel}/icons/tx.png`;

            if (isMobile() && radioModel !== "E5" && radioModel !== "APX4500-G") { // E5 temp fix
                redIcon.src = `models/${radioModel}/icons/red.png`;
                redIcon.style.display = 'block';
            }

            if (radioModel === "APXNext") {
                txBox.style.display = "block";
                rxBox.style.display = "none";
                txBox.style.backgroundColor = "red";
            }

            await sleep(50);

            if (!isVoiceRequested && !isVoiceGranted) {
                SendGroupVoiceRequest();
                isVoiceRequested = true;
                isVoiceGranted = false;
            } /*else {
                isTxing = false;
                document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
            }*/
        } else {
            isVoiceGranted = false;
            isTxing = false;
            isVoiceRequested = true;
            document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;

            if (isMobile()) redIcon.style.display = 'none';

            if (radioModel === "APXNext") {
                txBox.style.display = "none";
            }
        }
    } else if (event.data.type === "pttRelease") {
        if (isScannerModel())
            return;

        await sleep(655); // Temp fix to ensure all voice data makes it through before releasing; Is this correct?
                              // Should we check if the audio buffer is empty instead? Now I am just talking to myself..

        isVoiceGrantHandled = false;

        if (isTxing && isRegistered) {
            SendGroupVoiceRelease();
            currentFrequncyChannel = null;
        } else {
            console.debug("not txing not releasing");
        }

        document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
        isTxing = false;
    } else if (event.data.type === 'showStartupMessage') {
        document.getElementById('startup-message').style.display = 'block';
    } else if (event.data.type === 'hideStartupMessage') {
        document.getElementById('startup-message').style.display = 'none';
    } else if (event.data.type === 'setRid') {
        myRid = event.data.rid;
    } else if (event.data.type === 'setModel') {
        currentCodeplug = event.data.currentCodeplug;
        scanManager = new ScanManager(currentCodeplug);
        // console.debug(JSON.stringify(scanManager.getScanListForChannel(), null, 2));
        radioModel = event.data.model;

        if (event.data.flyingVehicle) {
            micCapture.enableAirCommsEffect();
            //await micCapture.enableRotorSound('audio/heliblades.wav');
        } else {
            micCapture.disableAirCommsEffect();
            //micCapture.disableRotorSound();
        }

        if (!isMobile()) {
            document.getElementById("battery-icon").src = `models/${radioModel}/icons/battery${batteryLevel}.png`;
        }

        loadUIState();
        loadRadioModelAssets(event.data.model);
    } else if (event.data.type === 'radioFocused') {
        document.getElementById('scalemove').style.display = 'block';
    } else if (event.data.type === 'activate_emergency') {
        StartEmergencyAlarm();
    } else if (event.data.type === 'setSiteStatus') {
        SetSiteStatus(event.data.sid, event.data.status, event.data.sites)
    } else if (event.data.type === 'playerLocation') {
        const {latitude, longitude} = event.data;

        currentLat = latitude;
        currentLng = longitude;
    } else if (event.data.type === 'FL_01/82') {
        error = "FL_01/82";
        loadUIState();
        loadRadioModelAssets("APX6000");
        document.getElementById("rssi-icon").style.display = 'none';
        document.getElementById('radio-container').style.display = 'block';
    } else if (event.data.type === 'setRssiLevel') {
        let siteChanged = false;

        if (!radioOn) {
            return;
        }

        if (currentSite == null) {
            currentSite = event.data.site;
        }

        if (event.data.site.siteID !== currentSite.siteID){
            console.debug("Changed from site " + currentSite.name + " to " + event.data.site.name)
            siteChanged = true;
        }

        currentSite = event.data.site;

        if (event.data.level === 0) {
            isInRange = false;
            fringVC = true;
            setUiOOR(isInRange);
        } else if (event.data.level > 0 && !isInRange) {
            isInRange = true;
            fringVC = false;
            setUiOOR(isInRange);
        }

        if (isInRange && event.data.failsoft)
            setUiFailsoft(true);

        if (isInRange && !event.data.failsoft)
            setUiFailsoft(false);

        if (currentRssiLevel !== null && currentRssiLevel === parseInt(event.data.level)) {
            // console.debug("RSSI Level not changed")
            return;
        }

        if (siteChanged && isRegistered && !isInSiteTrunking) {
            sendAffiliation().then();
        }

        currentRssiLevel = event.data.level;
        currentDbLevel = event.data.dbRssi;
        rssiIcon.src = `models/${radioModel}/icons/rssi${event.data.level}.png`;
    }
});

async function powerOn(reReg) {
    try {
        radioOn = true;
        // Notify client that radio is powered on
        fetch(`https://${GetParentResourceName()}/radioPowerState`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poweredOn: true })
        });
        currentMessageIndex = 0;

        pcmPlayer.clear();

        if (myRid == null) {
            document.getElementById('line2').style.display = 'block';
            setLine2(`Fail 01/83`);
            return;
        }

        if (error !== null) {
            document.getElementById('line2').style.display = 'block';
            setLine2(`Fail 01/00`);
            return;
        }

        if (inhibited) {
            console.log('Unit is INHIBITED');
            return;
        }

        if (currentCodeplug === null || currentCodeplug === undefined) {
            document.getElementById('line2').style.display = 'block';
            setLine2(`Fail 01/82`);
            return;
        }

        let currentZone;
        let currentChannel;

        try {
            currentZone = currentCodeplug.zones[currentZoneIndex];
            currentChannel = currentZone.channels[currentChannelIndex];

            scanManager = new ScanManager(currentCodeplug);
        } catch (error) {
            setLine2(`Fail 01/82`);
            return;
        }

        // console.debug(JSON.stringify(scanManager.getScanListForChannel(currentZone.name, currentChannel.name), null, 2));

        if (!initialized) {
            await micCapture.captureMicrophone(() => console.log('Microphone capture started.'));
        }

        initialized = true;

        startToneWatchdogLoop();

        document.getElementById("line1").style.display = 'block';
        document.getElementById("line2").style.display = 'block';
        document.getElementById("line3").style.display = 'block';

        if (radioModel === "APX900") {
            const bootImage = document.getElementById('boot-image');
            bootImage.src = `models/${radioModel}/boot.png`;
            bootImage.style.display = 'block';

            await new Promise(resolve => setTimeout(resolve, 1500));

            bootImage.style.display = 'none';
        } else {
            const bootScreenMessages = [
                {text: "", duration: 0, : "line1"},
                {text: "", duration: 0, : "line3"},
                {text: HOST_VERSION, duration: 1500, : "line2"},
                {text: radioModel, duration: 1500, line: "line2"}
            ];

            await displayBootScreen(bootScreenMessages);
        }

        if (!isScannerModel() && currentCodeplug.isAnnounceZoneChannelTalkgroups === true && isResponsiveVoiceApiKeySet === true) {
            responsiveVoice.speak(`${currentZone.name_announce}`, `US English Female`, {rate: .8});
            responsiveVoice.speak(`${currentChannel.name_announce}`, `US English Female`, {rate: .8});
        }

        updateDisplay();

        if (!isScannerModel()) {
            document.getElementById("softText1").innerHTML = 'ZnUp';
            document.getElementById("softText2").innerHTML = 'RSSI';
            document.getElementById("softText3").innerHTML = 'ChUp';
            document.getElementById("softText4").innerHTML = 'Scan';
            document.getElementById("softText1").style.display = 'block';
            document.getElementById("softText2").style.display = 'block';
            document.getElementById("softText3").style.display = 'block';
            document.getElementById("softText4").style.display = 'block';
            document.getElementById("battery-icon").style.display = 'block';
            document.getElementById("battery-icon").src = `models/${radioModel}/icons/battery${batteryLevel}.png`;
            document.getElementById("scan-icon").style.display = 'none';
            document.getElementById("scan-icon").src = `models/${radioModel}/icons/scan.png`;
            rssiIcon.style.display = 'block';
        }

        if (radioModel === "APXNext") {
            document.getElementById("next-icon1").style.display = "block";
            document.getElementById("next-icon2").style.display = "block";
            document.getElementById("next-icon3").style.display = "block";
            document.getElementById("next-text").innerHTML = 'More';
        } else {
            document.getElementById("next-icon1").style.display = "none";
            document.getElementById("next-icon2").style.display = "none";
            document.getElementById("next-icon3").style.display = "none";
            document.getElementById("next-text").innerHTML = '';
        }

        connectWebSocket();

        if (reReg) {
            SendRegistrationRequest();
            SendGroupAffiliationRequest();
        }
    } catch (error) {
        console.log(error);

        setLine2(`Fail 01/12`);
    }
}

async function powerOff(stayConnected) {
    try {
        pcmPlayer.clear();
        // Notify client that radio is powered off
        fetch(`https://${GetParentResourceName()}/radioPowerState`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ poweredOn: false })
        });
        stopCheckLoop();
        if (!stayConnected)
            await SendDeRegistrationRequest();
        await sleep(1000);

        isAffiliated = false;
        isRegistered = false;
        isVoiceGranted = false;
        isVoiceRequested = false;
        isVoiceGrantHandled = false;
        isInRange = false;
        fringVC = false;
        isInSiteTrunking = false;
        isTxing = false;
        radioOn = false;
        haltAllLine3Messages = false;
        error = null;

        document.getElementById("line1").innerHTML = '';
        document.getElementById("line2").innerHTML = '';
        document.getElementById("line3").innerHTML = '';
        document.getElementById("line1").style.display = 'none';
        document.getElementById("line2").style.display = 'none';
        document.getElementById("line3").style.display = 'none';
        document.getElementById("rssi-icon").style.display = 'none';
        document.getElementById("scan-icon").style.display = 'none';
        document.getElementById("battery-icon").style.display = 'none';
        document.getElementById("softText1").innerHTML = '';
        document.getElementById("softText2").innerHTML = '';
        document.getElementById("softText3").innerHTML = '';
        document.getElementById("softText4").innerHTML = '';
        document.getElementById("softText1").style.display = 'none';
        document.getElementById("softText2").style.display = 'none';
        document.getElementById("softText3").style.display = 'none';
        document.getElementById("softText4").style.display = 'none';

        document.getElementById("next-icon1").style.display = "none";
        document.getElementById("next-icon2").style.display = "none";
        document.getElementById("next-icon3").style.display = "none";
        document.getElementById("tx-box").style.display = "none";
        document.getElementById("rx-box").style.display = "none";
        document.getElementById("next-text").innerHTML = '';

        redIcon.style.display = 'none';
        yellowIcon.style.display = 'none';
        greenIcon.style.display = 'none';
        rxBox.style.display = "none";
        txBox.style.display = "none";

        if (!stayConnected) {
            disconnectWebSocket();
        }
    } catch (error) {
        console.log(error);
        setLine1("");
        setLine2("");
        setLine3("")
    }
}

function displayBootScreen(bootScreenMessages) {
    return new Promise((resolve) => {
        function showNextMessage() {
            if (currentMessageIndex < bootScreenMessages.length) {
                const message = bootScreenMessages[currentMessageIndex];
                document.getElementById(message.line).innerHTML = message.text;
                setTimeout(() => {
                    currentMessageIndex++;
                    showNextMessage();
                }, message.duration);
            } else {
                resolve();
            }
        }

        showNextMessage();
    });
}

document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        document.getElementById('scalemove').style.display = 'none';
        fetch(`https://${GetParentResourceName()}/unFocus`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
    }
});

document.getElementById('power-btn').addEventListener('click', () => {
    if (radioOn) {
        powerOff().then();
    } else {
        powerOn().then();
    }
});

document.getElementById('btn-emer').addEventListener('click', () => {
    StartEmergencyAlarm();
});

document.getElementById('channel-up').addEventListener('click', () => {
    changeChannel(1);
});

document.getElementById('channel-knbu').addEventListener('click', () => {
    changeChannel(1);
});

document.getElementById('channel-knbd').addEventListener('click', () => {
    changeChannel(-1);
});

document.getElementById('zone-up').addEventListener('click', () => {
    changeZone(1);
});

document.getElementById('rssi-btn').addEventListener('click', () => {
    haltAllLine3Messages = true;
    buttonBeep();
    const line3 = document.getElementById('line3');
    line3.style.backgroundColor = '';
    line3.style.color = 'black';
    line3.innerHTML = `SITE: ${currentSite.siteID}`;
    setTimeout(() => {
        line3.innerHTML = `RSSI: ${Math.round(currentDbLevel)} dBm`;
    }, 2000);
    setTimeout(() => {
        haltAllLine3Messages = false;
        if (!isInRange) {
            setUiOOR(isInRange);
        } else if (isInSiteTrunking) {
            setUiSiteTrunking(isInSiteTrunking);
        } else {
            line3.innerHTML = '';
        }
    }, 4000);
});

function SetSiteStatus(sid, status, sites) {
    const site = sites[sid];

    if (site !== undefined && site !== null) {
        console.log(`Set site status: ${sid}, site: ${status}, site name: ${sites[sid].name}`);

        SendStsBcast(site, status);
    } else {
        console.log("Ermmm site doesnt exist? Valid numbers are 0 - " + sites.length);
    }
}

function StartEmergencyAlarm() {
    if (!isRegistered || !isInRange || isInSiteTrunking)
        return;

    fetch(`https://${GetParentResourceName()}/getPlayerLocation`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    })
        .then(response => response.json())
        .then(() => {
            SendEmergencyAlarmRequest();
        })
        .catch(error => {
            console.error("Failed to get location:", error);
        });

    emergency_tone_generate();
}

function changeChannel(direction) {
    isTxing = false;
    isReceiving = false;
    isReceivingParkedChannel = false;

    scanOff();

    if (currentCodeplug.zones === null || currentCodeplug.zones === undefined) {
        displayError("Fail 01/82");
    }

    currentChannelIndex += direction;

    const currentZone = currentCodeplug.zones[currentZoneIndex];

    if (currentChannelIndex >= currentZone.channels.length) {
        currentChannelIndex = 0;
    } else if (currentChannelIndex < 0) {
        currentChannelIndex = currentZone.channels.length - 1;
    }

    if (currentZone.channels === null || currentZone.channels === undefined) {
        powerOff().then();
        setLine2("Fail 01/82");
    }

    if (currentCodeplug.isAnnounceZoneChannelTalkgroups === true && isResponsiveVoiceApiKeySet === true) {
        const currentChannel = currentZone.channels[currentChannelIndex];
        responsiveVoice.speak(`${currentChannel.name_announce}`, `US English Female`, {rate: .8});
    }

    SendGroupAffiliationRemoval(currentTg);

    updateDisplay();

    if (!isInSiteTrunking) {
        sendAffiliation().then();
    } else {
        isAffiliated = false;
    }
    reconnectIfSystemChanged();
}

function changeZone(direction) {
    isTxing = false;
    isReceiving = false;
    isReceivingParkedChannel = false;

    scanOff();

    if (currentCodeplug.zones === null || currentCodeplug.zones === undefined) {
        displayError("Fail 01/82");
    }

    currentZoneIndex += direction;

    if (currentZoneIndex >= currentCodeplug.zones.length) {
        currentZoneIndex = 0;
    } else if (currentZoneIndex < 0) {
        currentZoneIndex = currentCodeplug.zones.length - 1;
    }

    currentChannelIndex = 0;

    if (currentCodeplug.isAnnounceZoneChannelTalkgroups === true && isResponsiveVoiceApiKeySet === true) {
        const currentZone = currentCodeplug.zones[currentZoneIndex];
        const currentChannel = currentZone.channels[currentChannelIndex];
        responsiveVoice.speak(`${currentZone.name_announce}`, `US English Female`, {rate: .8});
        responsiveVoice.speak(`${currentChannel.name_announce}`, `US English Female`, {rate: .8});
    }
    
    SendGroupAffiliationRemoval(currentTg);

    updateDisplay();

    if (!isInSiteTrunking) {
        sendAffiliation().then();
    } else {
        isAffiliated = false;
    }
    
    reconnectIfSystemChanged();
}

function updateDisplay() {
    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];

    setLine1(currentZone.name);
    setLine2(currentChannel.name);
    currentTg = currentChannel.tgid.toString();
}

async function hashKey(key) {
    if (!key || key.trim() === '') {
        return '';
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(key.trim());

    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashBase64 = btoa(String.fromCharCode(...hashArray));

    return hashBase64;
}

async function reconnectIfSystemChanged() {
    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];
    const currentSystem = currentCodeplug.systems.find(system => system.name === currentChannel.system);

    pcmPlayer.clear();

    const hashedAuthKey = await hashKey(currentSystem.authKey);
    const masterEndpoint = `ws://${currentSystem.address}:${currentSystem.port}/client?authKey=${encodeURIComponent(hashedAuthKey)}`;

    if (socket && socket.url !== masterEndpoint) {
        disconnectWebSocket();
        connectWebSocket();
        if (!isInSiteTrunking) {
            sendRegistration().then(() => {
            });
        } else {
            isRegistered = false;
        }
    }
}

async function connectWebSocket() {
    //console.log(JSON.stringify(currentCodeplug));
    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];
    const currentSystem = currentCodeplug.systems.find(system => system.name === currentChannel.system);

    pcmPlayer.clear();

    console.debug("Connecting to master...");

    if (socket) {
        console.warn("Cleaning up old connection before reconnect");
        socket.onopen = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;

        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close();
        }

        socket = null;
    }

    const hashedAuthKey = await hashKey(currentSystem.authKey);
    const masterEndpoint = `ws://${currentSystem.address}:${currentSystem.port}/client?authKey=${encodeURIComponent(hashedAuthKey)}`;

    socket = new WebSocket(masterEndpoint);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
        if (isScannerModel()){
            socket.send("CONVENTIONAL_PEER_ENABLE");
            console.log("connected as conv peer, aff restrictions will be ignored");
        }

        isInSiteTrunking = false;
        setUiSiteTrunking(isInSiteTrunking);
        console.debug('WebSocket connection established');
        isVoiceGranted = false;
        isVoiceRequested = false;
        isVoiceGrantHandled = false;
        isTxing = false;
        // console.debug("Codeplug: " + currentCodeplug);
        if (!isScannerModel())
            startCheckLoop();
        pcmPlayer.clear();
    };

    socket.onclose = () => {
        isInSiteTrunking = true;
        document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
        redIcon.style.display = 'none';
        txBox.style.display = "none";
        setUiSiteTrunking(isInSiteTrunking);
        isVoiceGranted = false;
        isVoiceRequested = false;
        isVoiceGrantHandled = false;
        isReceivingParkedChannel = false;
        scanTgActive = false;
        isTxing = false;
        console.debug('WebSocket connection closed');
        pcmPlayer.clear();
    }

    socket.onerror = (error) => {
        isInSiteTrunking = true;
        setUiSiteTrunking(isInRange);
        isVoiceGranted = false;
        isVoiceRequested = false;
        isVoiceGrantHandled = false;
        isTxing = false;
        isReceivingParkedChannel = false;
        scanTgActive = false;
        console.error('WebSocket error:');
        console.error(error);
        pcmPlayer.clear();
    }

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        const currentZone = currentCodeplug.zones[currentZoneIndex];
        const currentChannel = currentZone.channels[currentChannelIndex];
        const currentSystem = currentCodeplug.systems.find(system => system.name === currentChannel.system);

        if (typeof event.data === 'string') {
            // console.debug(`Received WlinkPacket from master: ${event.data}`);

            // allow sts bcast so we know to turn a site back on (Fail rp ikr! chris would NOT approve)
            // allow SPEC_FUNC so we know to uninhibit the radio
            // 0x21 = WlinkPacket STS_BCAST
            // 0x22 = WlinkPacket SPEC_FUNC
            if ((!isInRange || !radioOn) && data.type !== 0x21 && data.type !== 0x22) {
                console.debug("Not in range or powered off, not processing message from master");
                return;
            }

            if (data.type === packetToNumber("GRP_AFF_RSP")) {
                //console.log(currentTg + " " + myRid);
                if (data.data.SrcId.trim() !== myRid.trim() || data.data.DstId.trim() !== currentTg) {
                    return;
                }

                console.log("Affiliation accepted");
                isAffiliated = data.data.Status === 0;
            } else if (data.type === packetToNumber("U_REG_RSP")) {
                if (data.data.SrcId !== myRid) {
                    return;
                }

                isRegistered = data.data.Status === 0;
            } else if (data.type === packetToNumber("AUDIO_DATA")) {
                if (currentFrequncyChannel == null)
                    return;

                if (data.data.VoiceChannel.SrcId !== myRid && (data.data.VoiceChannel.DstId.toString() === currentTg || (scanManager.isTgInCurrentScanList(currentZone.name, currentChannel.name, data.data.VoiceChannel.DstId) && scanEnabled)) && data.data.VoiceChannel.Frequency.toString() === currentFrequncyChannel.toString()) {
                    lastAudioTime = Date.now();
                    const binaryString = atob(data.data.Data);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    handleAudioData(bytes.buffer);
                } else {
                    console.log("ignoring audio, not for us");
                }
            } else if (data.type === packetToNumber("GRP_VCH_RSP")) {
                if (data.data.SrcId !== myRid && data.data.DstId === currentTg && data.data.Status === 0 && !scanTgActive) {
                    isReceiving = true;
                    isReceivingParkedChannel = true;
                    currentFrequncyChannel = data.data.Channel;
                    isTxing = false;
                    haltAllLine3Messages = true;
                    document.getElementById("line3").style.color = "black";
                    if (isScannerModel()) {
                        document.getElementById("line3").style.color = "white";
                        document.getElementById("line3").innerHTML = `Fm:[${data.data.SrcId}]`;
                    } else{
                        document.getElementById("line3").innerHTML = `ID: ${data.data.SrcId}`;
                    }
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rx.png`;
                    if (radioModel === "APXNext") rxBox.style.display = "block";
                    txBox.style.display = "none";
                    rxBox.style.backgroundColor = "yellow";
                    if (isMobile()) {
                        yellowIcon.src = `models/${radioModel}/icons/yellow.png`;
                        yellowIcon.style.display = 'block';
                    }
                } else if (scanManager !== null && !isReceivingParkedChannel && (data.data.SrcId !== myRid && scanManager.isTgInCurrentScanList(currentZone.name, currentChannel.name, data.data.DstId)) && scanEnabled) {
                    //console.log("Received GRP_VCH_RSP for TG in scan list");
                    if (isReceivingParkedChannel || isReceiving) {
                        return;
                    }

                    scanTg = data.data.DstId;
                    scanTgActive = true;
                    isReceivingParkedChannel = false;
                    isReceiving = true;
                    currentFrequncyChannel = data.data.Channel;
                    isTxing = false;
                    haltAllLine3Messages = true;
                    setLine1(scanManager.getChannelAndZoneForTgInCurrentScanList(currentZone.name, currentChannel.name, data.data.DstId).zone);
                    setLine2(scanManager.getChannelAndZoneForTgInCurrentScanList(currentZone.name, currentChannel.name, data.data.DstId).channel);
                    document.getElementById("line3").style.color = "black";
                    if (isScannerModel()) {
                        document.getElementById("line3").style.color = "white";
                        document.getElementById("line3").innerHTML = `Fm:[${data.data.SrcId}]`;
                    } else{
                        document.getElementById("line3").innerHTML = `ID: ${data.data.SrcId}`;
                    }
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rx.png`;
                    rxBox.style.display = "none";
                    if (isMobile()) {
                        yellowIcon.src = `models/${radioModel}/icons/yellow.png`;
                        yellowIcon.style.display = 'block';
                    }
                } else if (data.data.SrcId === myRid && data.data.DstId === currentTg && data.data.Status === 0) {
                    //if (!isVoiceGranted && isVoiceRequested) {
                    currentFrequncyChannel = data.data.Channel;
                    isTxing = true;
                    isVoiceGranted = true;
                    isVoiceRequested = false;
                    isReceiving = false;
                    isReceivingParkedChannel = false;
                    scanTgActive = false;
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
                    if (isMobile()) redIcon.style.display = 'none';
                    txBox.style.display = "none";
                    isVoiceRequested = false;
                    isVoiceGranted = true;
                    setTimeout(() => {
                        if (isTxing) {
                            tpt_generate();
                            document.getElementById("rssi-icon").src = `models/${radioModel}/icons/tx.png`;
                            if (isMobile() && radioModel !== "E5" && radioModel !== "APX4500-G") { // E5 temp fix
                                redIcon.src = `models/${radioModel}/icons/red.png`;
                                redIcon.style.display = 'block';
                            }

                            if (radioModel === "APXNext") {
                                if (radioModel === "APXNext") txBox.style.display = "block";
                                rxBox.style.display = "none";
                                txBox.style.backgroundColor = "red";
                            }
                        } else {
                            console.log("After 200ms isTxing = false, bonking");
                            document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
                            redIcon.style.display = 'none';
                            txBox.style.display = "none";
                            isTxing = false;
                            isVoiceGranted = false;
                            if (currentFrequncyChannel !== null) {
                                SendGroupVoiceRelease();
                            }
                            bonk();
                        }
                    }, 200);
                    isVoiceGrantHandled = true;
                    /*                    } else {
                                            isTxing = false;
                                            isVoiceGranted = false;
                                        }*/
                } else if (data.data.SrcId === myRid && data.data.DstId === currentTg && data.data.Status !== 0) {
                    bonk();
                }
            } else if (data.type === packetToNumber("GRP_VCH_RLS")) {
                if (data.data.SrcId !== myRid && data.data.DstId === currentTg && !scanTgActive) {
                    haltAllLine3Messages = false;
                    if (!isInRange) {
                        setUiOOR(isInRange);
                    } else if (isInSiteTrunking) {
                        setUiSiteTrunking(isInSiteTrunking);
                    } else {
                        document.getElementById("line3").innerHTML = '';
                    }
                    isReceiving = false;
                    isReceivingParkedChannel = false;
                    currentFrequncyChannel = null;
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
                    yellowIcon.style.display = 'none';
                    rxBox.style.display = "none";
                    pcmPlayer.clear();
                } else if (scanManager !== null && !isReceivingParkedChannel && (data.data.SrcId !== myRid && scanManager.isTgInCurrentScanList(currentZone.name, currentChannel.name, data.data.DstId)) && scanEnabled && data.data.DstId === scanTg) {
                    haltAllLine3Messages = false;
                    scanTgActive = false;
                    scanTg = "";

                    if (!isInRange) {
                        setUiOOR(isInRange);
                    } else if (isInSiteTrunking) {
                        setUiSiteTrunking(isInSiteTrunking);
                    } else {
                        document.getElementById("line3").innerHTML = '';
                    }

                    isReceiving = false;
                    currentFrequncyChannel = null;

                    console.log(currentZoneIndex + " " + currentChannelIndex);

                    setLine1(currentZone.name);
                    setLine2(currentChannel.name);
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
                    yellowIcon.style.display = 'none';
                    rxBox.style.display = "none";
                    pcmPlayer.clear();
                } else if (data.data.SrcId === myRid && data.data.DstId === currentTg) {
                    isVoiceGranted = false;
                    isVoiceRequested = false;
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
                    redIcon.style.display = 'none';
                    txBox.style.display = "none";
                    pcmPlayer.clear();
                }
            } else if (data.type === packetToNumber("EMRG_ALRM_RSP")) {
                if (data.data.SrcId !== myRid && data.data.DstId === currentTg) {
                    const line3 = document.getElementById("line3");
                    haltAllLine3Messages = true;
                    emergency_tone_generate();
                    line3.style.color = "white";
                    line3.style.backgroundColor = "orange";
                    line3.innerHTML = `EM: ${data.data.SrcId}`;

                    setTimeout(() => {
                        line3.style.color = "black";
                        line3.style.backgroundColor = '';
                        if (!isInRange) {
                            setUiOOR(isInRange);
                        } else if (isInSiteTrunking) {
                            setUiSiteTrunking(isInSiteTrunking);
                        } else {
                            line3.innerHTML = '';
                        }

                        haltAllLine3Messages = false;
                    }, 5000);
                }
            } else if (data.type === packetToNumber("CALL_ALRT")) {
                if (data.data.SrcId !== myRid && data.data.DstId === myRid) {
                    haltAllLine3Messages = true;
                    document.getElementById("line3").style.color = "black";
                    document.getElementById("line3").innerHTML = `Page: ${data.data.SrcId}`;

                    // send twice for future use (for loop is really not needed here smh)
                    SendAckResponse(packetToNumber("CALL_ALRT"), data.data.SrcId);
                    SendAckResponse(packetToNumber("CALL_ALRT"), data.data.SrcId);

                    play_page_alert();

                    setTimeout(() => {
                        document.getElementById("line3").style.color = "black";
                        document.getElementById("line3").innerHTML = '';
                        haltAllLine3Messages = false;
                    }, 3000);
                }
            } else if (data.type === packetToNumber("STS_BCAST")) {
                fetch(`https://${GetParentResourceName()}/receivedStsBcast`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({site: data.data.Site, status: data.data.Status})
                }).then();
            } else if (data.type === packetToNumber("SPEC_FUNC")) {
                if (data.data.DstId.toString() === myRid && data.data.Function === 0x01 && Number(data.data.SrcId) === FNE_ID) {
                    console.log("Unit INHIBITED");
                    SendAckResponse(packetToNumber("SPEC_FUNC"), data.data.SrcId,0x01); // inhibit = 0x01
                    inhibited = true;
                    powerOff(true).then();
                } else if (data.data.DstId.toString() === myRid && data.data.Function === 0x02 && Number(data.data.SrcId) === FNE_ID) {
                    console.log("Unit UNINHIBITED");
                    SendAckResponse(packetToNumber("SPEC_FUNC"), data.data.SrcId,0x02); // uninhibit = 0x01
                    inhibited = false;
                    powerOn(true).then();
                }
            } else if (data.type === packetToNumber("REL_DEMAND")) {
                if (data.data.DstId.toString() === myRid && Number(data.data.SrcId) === FNE_ID) {
                    isVoiceGranted = false;
                    isVoiceRequested = false;
                    isTxing = false;
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
                    pcmPlayer.clear();
                }
            } else if (data.type === packetToNumber("GRP_VCH_UPD")) {
                if (data.data.VoiceChannel.SrcId.toString() == null)
                    return;

                if (data.data.VoiceChannel.SrcId.toString() !== myRid && data.data.VoiceChannel.DstId.toString() === currentTg
                    && isAffiliated && isRegistered && isInRange && !isReceiving && !isTxing) {
                    isReceiving = true;
                    currentFrequncyChannel = data.data.VoiceChannel.Frequency;
                    isTxing = false;
                    haltAllLine3Messages = true;
                    document.getElementById("line3").style.color = "black";
                    if (isScannerModel()) {
                        document.getElementById("line3").style.color = "white";
                        document.getElementById("line3").innerHTML = `Fm:[${data.data.SrcId}]`;
                    } else{
                        document.getElementById("line3").innerHTML = `ID: ${data.data.SrcId}`;
                    }
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rx.png`;
                }
            } else {
                //console.debug(event.data);
            }
        } else if (event.data instanceof ArrayBuffer) {
            console.debug('Binary data received?', event.data);
        } else {
            console.debug('Unknown data type received:', event.data);
        }
    };
}

function setUiOOR(inRange) {
    const line3 = document.getElementById('line3');

    if (inRange) {
        line3.innerHTML = '';
        line3.style.backgroundColor = '';
    } else {
        line3.innerHTML = 'Out of range';
        line3.style.color = 'white';
        line3.style.backgroundColor = 'red';
    }
}

function setUiFailsoft(inFailsoft) {
    const line3 = document.getElementById('line3');

    if (!haltAllLine3Messages) {
        if (!inFailsoft) {
            line3.innerHTML = '';
            line3.style.backgroundColor = '';
        } else {
            line3.innerHTML = 'Failsoft';
            line3.style.color = 'white';
            line3.style.backgroundColor = 'red';
        }
    }
}

function setUiSiteTrunking(inSt) {
    const line3 = document.getElementById('line3');

    if (!isInRange) {
        return;
    }

    if (!haltAllLine3Messages) {
        if (!inSt) {
            haltAllLine3Messages = false;
            line3.innerHTML = '';
            line3.style.backgroundColor = '';
        } else {
            haltAllLine3Messages = true;
            line3.innerHTML = 'Site trunking';
            line3.style.color = 'black';
            line3.style.backgroundColor = '';
        }
    }
}

function setLine1(text) {
    document.getElementById('line1').innerHTML = text;
}

function setLine2(text) {
    document.getElementById('line2').innerHTML = text;
}

function setLine3(text) {
    document.getElementById('line3').innerHTML = text;
}

function handleAudioData(data) {
    const dataArray = new Uint8Array(data);

    if (dataArray.length > 0) {
        pcmPlayer.feed(dataArray);

        const float32Array = new Float32Array(dataArray.length / 2);
        for (let i = 0; i < dataArray.length; i += 2) {
            const sample = (dataArray[i + 1] << 8) | dataArray[i];
            float32Array[i / 2] = sample > 0x7FFF ? (sample - 0x10000) / 0x8000 : sample / 0x7FFF;
        }

        detectTone(float32Array);
    } else {
        console.debug('Received empty audio data array');
    }
}

function detectTone(samples) {
    const fftSize = 2048;
    const context = new OfflineAudioContext(1, fftSize, 8000);
    const buffer = context.createBuffer(1, samples.length, 8000);
    buffer.getChannelData(0).set(samples);

    const source = context.createBufferSource();
    source.buffer = buffer;

    const analyser = context.createAnalyser();
    analyser.fftSize = fftSize;

    source.connect(analyser);
    analyser.connect(context.destination);

    source.start();

    context.startRendering().then(() => {
        const freqData = new Float32Array(analyser.frequencyBinCount);
        analyser.getFloatFrequencyData(freqData);

        let maxVal = -Infinity;
        let maxIndex = -1;
        for (let i = 0; i < freqData.length; i++) {
            if (freqData[i] > maxVal) {
                maxVal = freqData[i];
                maxIndex = i;
            }
        }

        const detectedFreq = Math.round(maxIndex * 8000 / fftSize);

        processTone(detectedFreq);
    });
}

function processTone(frequency) {
    const now = Date.now();

    //console.log(`detected frequency: ${frequency} Hz`);

    if (frequency < 300 || frequency > 3000) {
        //console.log('frequency out of valid range');
        if (lastTone !== null) {
            const duration = now - toneStartTime;
            //console.log(`ending tone ${lastTone} after ${duration} ms`);
            toneHistory.push({ freq: lastTone, duration });
            detectQC2Pair();
            lastTone = null;
            toneStartTime = null;
        }
        return;
    }

    if (lastTone === null) {
        //console.log(`starting new tone ${frequency}`);
        toneStartTime = now;
        lastTone = frequency;
    } else if (Math.abs(frequency - lastTone) <= FREQUENCY_TOLERANCE) {
        const duration = now - toneStartTime;
        //console.log(`continuing tone ${frequency} for ${duration} ms`);
    } else {
        const duration = now - toneStartTime;
        //console.log(`tone changed: ${lastTone} lasted ${duration} ms`);
        toneHistory.push({ freq: lastTone, duration });
        detectQC2Pair();

        lastTone = frequency;
        toneStartTime = now;
        //console.log(`new tone started: ${frequency}`);
    }
}

function detectQC2Pair() {
    if (toneHistory.length < 2) {
        //console.log('not enough tones in history to detect qc2');
        return;
    }

    const recent = toneHistory.slice(-2);
    const [toneA, toneB] = recent;

    const durationA = toneA.duration;
    const durationB = toneB.duration;

    //console.log(`checking pair: A=${toneA.freq} Hz (${durationA} ms), B=${toneB.freq} (${durationB} ms)`);

    if (
        durationA >= 900 && durationA <= 1200 &&
        durationB >= 2500 && durationB <= 3500
    ) {
        console.log(`QC2 Pair Detected A: ${toneA.freq}, B: ${toneB.freq}`);

        if (currentCodeplug.qcList != null) {
            for (const pair of currentCodeplug.qcList) {
                const isMatchA = Math.abs(toneA.freq - pair.a) <= FREQ_MATCH_THRESHOLD;
                const isMatchB = Math.abs(toneB.freq - pair.b) <= FREQ_MATCH_THRESHOLD;

                if (isMatchA && isMatchB) {
                    console.log(`QC2 ALERT: A=${pair.a} B=${pair.b}`);
                    minitorStandard();
                    break;
                }
            }
        }

        toneHistory = [];
    } else {
        //console.log(`no QC2 pattern`);
    }
}

let volumeChangeTimeout = null;

function volumeUp() {
    if (volumeChangeTimeout) return;
    volumeChangeTimeout = setTimeout(() => { volumeChangeTimeout = null; }, 550);
    if (volumeLevel < 1.0) {
        volumeLevel += 0.1;
        volumeLevel = Math.min(1.0, volumeLevel);
        //beepAudioCtx.gainNode.gain.value = volumeLevel;
        pcmPlayer.volume(volumeLevel);
        beep(910, 500, 30, 'sine');
        console.log(`Volume increased: ${volumeLevel}`);
    }
    else {
        console.log("Volume is already at maximum");
        tripleBeep();
    }
}

function volumeDown() {
    if (volumeChangeTimeout) return;
    volumeChangeTimeout = setTimeout(() => { volumeChangeTimeout = null; }, 550);
    if (volumeLevel > 0.0) {
        volumeLevel -= 0.1;
        volumeLevel = Math.max(0.1, volumeLevel);
        //beepAudioCtx.gainNode.gain.value = volumeLevel;
        pcmPlayer.volume(volumeLevel);
        beep(910, 500, 30, 'sine');
        console.log(`Volume decreased: ${volumeLevel}`);
    }
    else {
        console.log("Volume is already at minimum");
        tripleBeep();
    }
}

function beep(frequency, duration, volume, type) {
    const oscillator = beepAudioCtx.createOscillator();
    const gainNode = beepAudioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(beepAudioCtx.destination);
    gainNode.gain.value = Math.max(0.0, volumeLevel * (1.0 - beepVolumeReduction));
    oscillator.frequency.value = frequency;
    oscillator.type = type;

    oscillator.start();

    setTimeout(
        function () {
            oscillator.stop();
        },
        duration
    );
}

function tpt_generate() {
    beep(910, 30, 30, 'sine');
    setTimeout(function () {
        beep(0, 20, 30, 'sine');
    }, 30);
    setTimeout(function () {
        beep(910, 30, 30, 'sine');
    }, 50);
    setTimeout(function () {
        beep(0, 20, 30, 'sine');
    }, 80);
    setTimeout(function () {
        beep(910, 50, 30, 'sine');
    }, 100);
}

function play_page_alert() {
    beep(910, 150, 30, 'sine');
    setTimeout(function () {
        beep(0, 150, 30, 'sine');
    }, 150);
    setTimeout(() => {
        beep(910, 150, 30, 'sine');
    }, 300);
    setTimeout(() => {
        beep(0, 150, 30, 'sine');
    }, 450);
    setTimeout(() => {
        beep(910, 150, 30, 'sine');
    }, 600);
    setTimeout(() => {
        beep(0, 150, 30, 'sine');
    }, 750);
    setTimeout(() => {
        beep(910, 150, 30, 'sine');
    }, 900);
}

function emergency_tone_generate() {
    beep(610, 500, 30, 'sine');
    setTimeout(function () {
        beep(910, 500, 30, 'sine');
    }, 500);
    setTimeout(function () {
        beep(610, 500, 30, 'sine');
    }, 1000);
    setTimeout(function () {
        beep(910, 500, 30, 'sine');
    }, 1500);
}

function bonk() {
    beep(310, 1000, 30, 'sine');
}

function tripleBeep() {
    beep(910, 80, 30, 'sine');
    setTimeout(() => {
        beep(910, 80, 30, 'sine');
    }, 100);
    setTimeout(() => {
        beep(910, 80, 30, 'sine');
    }, 200);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function onAudioFrameReady(buffer, rms) {
    if (isTxing && currentFrequncyChannel !== null) {
        if (fringVC) {
            const degradedBuffer = simulateFringeCoverage(buffer, 8000);
            audioBuffer.push(...degradedBuffer);
        } else {
            audioBuffer.push(...buffer);
        }

        if (audioBuffer.length > MAX_BUFFER_SIZE) {
            console.warn("Audio buffer too large, dropping old frames");
            audioBuffer = audioBuffer.slice(audioBuffer.length - MAX_BUFFER_SIZE);
        }

        if (audioBuffer.length >= EXPECTED_PCM_LENGTH) {
            const fullFrame = audioBuffer.slice(0, EXPECTED_PCM_LENGTH);
            audioBuffer = audioBuffer.slice(EXPECTED_PCM_LENGTH);

            const response = {
                type: 0x01,
                rms: rms * 30.0,
                data: {
                    VoiceChannel: {
                        SrcId: myRid,
                        DstId: currentTg,
                        Frequency: currentFrequncyChannel
                    },
                    Site: currentSite,
                    Data: fullFrame
                }
            };

            const jsonString = JSON.stringify(response);
            setTimeout(() => socket.send(jsonString), 0);
        }
    }
}

function disconnectWebSocket() {
    if (socket) {
        pcmPlayer.clear();
        socket.close();
        socket = null;
    }
}

function buttonBeep() {
    playSoundEffect('audio/buttonbeep.wav');
}

function minitorStandard() {
    playSoundEffect('audio/minitor_standard.wav');
}

function playSoundEffect(audioPath) {
    let audio = new Audio(audioPath);
    audio.play().then();
}


function knobClick() {
    playSoundEffect('audio/knob-click.wav');
}

function scanOn() {
    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];

    console.log(currentZone + " " + currentChannel)

    const currentScanList = scanManager.getScanListForChannel(currentZone.name, currentChannel.name);

    if (currentScanList == null){
        displayError("Fail 01/84");
        return;
    }

    scanManager.getChannelsInScanList(currentScanList.name).forEach(channel => {
        console.log("tgid " + channel.tgid)
        SendGroupAffiliationRequest(channel.tgid);
    });

    scanEnabled = true;

    scanIcon.src =  `models/${radioModel}/icons/scan.png`;
    scanIcon.style.display= "block";
}

function scanOff() {
    scanEnabled = false;
    scanIcon.src =  `models/${radioModel}/icons/scan.png`;
    scanIcon.style.display= "none"; 
}

document.getElementById("scan-btn").addEventListener("click", function() {
    if (scanEnabled) {
        scanOff();
    } else {
        scanOn();
    }
});

/*
function buttonBonk() {
    playSoundEffect('buttonbonk.wav');
}
*/

function loadRadioModelAssets(model) {
    const radioImage = document.getElementById('radio-image');
    const radioStylesheet = document.getElementById('radio-stylesheet');
    radioImage.src = `models/${model}/radio.png`;
    radioStylesheet.href = `models/${model}/style.css`;

    if (model === "APXNext") {
        document.getElementById("next-icon1").src = `models/${model}/icons/next1.png`;
        document.getElementById("next-icon2").src = `models/${model}/icons/next2.png`;
        document.getElementById("next-icon3").src = `models/${model}/icons/next3.png`;
    } else {
        document.getElementById("next-icon1").src = "";
        document.getElementById("next-icon2").src = "";
        document.getElementById("next-icon3").src = "";
        document.getElementById("next-icon1").style.display = "none";
        document.getElementById("next-icon2").style.display = "none";
        document.getElementById("next-icon3").style.display = "none";
        document.getElementById("next-text").innerHTML = '';
    }

    if (currentRssiLevel !== null) {
        rssiIcon.src = `models/${model}/icons/rssi${currentRssiLevel}.png`;
    } else {
        rssiIcon.src = `models/${model}/icons/rssi${currentRssiLevel}.png`;
    }

    //console.log("Loaded model assets");
}

function displayError(err) {
    setLine1("");
    setLine3("");

    powerOff().then(r => {});

    setLine2(err);
}

window.onerror = function (message, source, lineno, colno, error) {
    console.error("Caught by window.onerror:", message, error, lineno, source);

    displayError("Fail 01/00");

    return true;
};

window.onunhandledrejection = function (event) {
    console.error("Unhandled promise rejection:", event.reason);

    displayError("Fail 01/10");

    return true;
};
