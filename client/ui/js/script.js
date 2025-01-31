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

const HOST_VERSION = "R02.08.00";

const FNE_ID = 0xFFFFFF

const beepAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

const rssiIcon = document.getElementById('rssi-icon');
const scanIcon = document.getElementById('scan-icon');

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

let myRid = "1234";
let currentTg = "2001";
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
    return radioModel === "APX4500" || radioModel === "E5" || radioModel === "XTL2500";
}

function setBatteryLevel() {
    if (batteryLevel > 0) {
        batteryLevel--;
        document.getElementById("battery-icon").src = `models/${radioModel}/icons/battery${batteryLevel}.png`;
    } else {
        powerOff().then();
    }
}

function startCheckLoop() {
    if (!socketOpen() || !isInRange || !radioOn || inhibited) {
        return;
    }

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
    clearInterval(affiliationCheckInterval);
    clearInterval(registrationCheckInterval);
    clearInterval(groupGrantCheckInterval);
    clearInterval(locationBroadcastInterval);
}

async function sendAffiliation() {
    try {
        rssiIcon.src = `models/${radioModel}/icons/tx.png`;
        await SendGroupAffiliationRequest();
        setTimeout(() => {
            rssiIcon.src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
        }, 75);
    } catch (error) {
        console.error('Error sending affiliation:', error);
    }
}

async function sendRegistration() {
    try {
        rssiIcon.src = `models/${radioModel}/icons/tx.png`;
        await SendRegistrationRequest();
        setTimeout(() => {
            rssiIcon.src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
        }, 75);
    } catch (error) {
        console.error('Error sending registration:', error);
    }
}

window.addEventListener('message', async function (event) {
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
    } else if (event.data.type === 'openRadio') {
        currentCodeplug = event.data.codeplug;

        scanManager = new ScanManager(currentCodeplug);

        if (!radioOn) {
            rssiIcon.style.display = 'none';
        }

        if (currentCodeplug == null) {
            document.getElementById('notification').innerText = "Please set your codeplug first with /set_codeplug <codeplug>";
            document.getElementById('notification').style.display = 'block';
            setTimeout(() => {
                document.getElementById('notification').style.display = 'none';
            }, 2000);
            return;
        }

        if (radioModel == null) {
            radioModel = currentCodeplug.radioWide.model;
        }

        loadUIState();
        loadRadioModelAssets(radioModel);

        document.getElementById('radio-container').style.display = 'block';
    } else if (event.data.type === 'closeRadio') {
        document.getElementById('radio-container').style.display = 'none';
    } else if (event.data.type === "pttPress") {
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
        }
    } else if (event.data.type === "pttRelease") {
        await sleep(450); // Temp fix to ensure all voice data makes it through before releasing; Is this correct?
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
    pcmPlayer.clear();

    currentMessageIndex = 0;

    if (error === "FL_01/82") {
        document.getElementById('line2').style.display = 'block';
        setLine2(`Fail 01/82`);
        return;
    }

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

    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];

    scanManager = new ScanManager(currentCodeplug);
    // console.debug(JSON.stringify(scanManager.getScanListForChannel(currentZone.name, currentChannel.name), null, 2));

    if (!initialized) {
        await micCapture.captureMicrophone(() => console.log('Microphone capture started.'));
    }

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
            {text: "", duration: 0, line: "line1"},
            {text: "", duration: 0, line: "line3"},
            {text: HOST_VERSION, duration: 1500, line: "line2"},
            {text: radioModel, duration: 1500, line: "line2"}
        ];

        await displayBootScreen(bootScreenMessages);
    }

    responsiveVoice.speak(`${currentZone.name}`, `US English Female`, {rate: .8});
    responsiveVoice.speak(`${currentChannel.name}`, `US English Female`, {rate: .8});

    updateDisplay();
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
    radioOn = true;
    initialized = true;
    rssiIcon.style.display = 'block';
    connectWebSocket();

    if (reReg) {
        SendRegistrationRequest();
        SendGroupAffiliationRequest();
    }
}

async function powerOff(stayConnected) {
    pcmPlayer.clear();
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
    if (!stayConnected) {
        disconnectWebSocket();
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
    currentChannelIndex += direction;

    const currentZone = currentCodeplug.zones[currentZoneIndex];

    if (currentChannelIndex >= currentZone.channels.length) {
        currentChannelIndex = 0;
    } else if (currentChannelIndex < 0) {
        currentChannelIndex = currentZone.channels.length - 1;
    }

    const currentChannel = currentZone.channels[currentChannelIndex];

    responsiveVoice.speak(`${currentChannel.name}`, `US English Female`, {rate: .8});
    if (!isInSiteTrunking) {
        sendAffiliation().then();
    } else {
        isAffiliated = false;
    }
    updateDisplay();
    reconnectIfSystemChanged();
}

function changeZone(direction) {
    currentZoneIndex += direction;

    if (currentZoneIndex >= currentCodeplug.zones.length) {
        currentZoneIndex = 0;
    } else if (currentZoneIndex < 0) {
        currentZoneIndex = currentCodeplug.zones.length - 1;
    }

    currentChannelIndex = 0;
    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];

    responsiveVoice.speak(`${currentZone.name}`, `US English Female`, {rate: .8});
    responsiveVoice.speak(`${currentChannel.name}`, `US English Female`, {rate: .8});
    updateDisplay();
    reconnectIfSystemChanged();
}

function updateDisplay() {
    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];

    setLine1(currentZone.name);
    setLine2(currentChannel.name);
    currentTg = currentChannel.tgid.toString();
}

function reconnectIfSystemChanged() {
    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];
    const currentSystem = currentCodeplug.systems.find(system => system.name === currentChannel.system);

    pcmPlayer.clear();

    if (socket && socket.url !== `ws://${currentSystem.address}:${currentSystem.port}/client`) {
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

function connectWebSocket() {
    //console.log(JSON.stringify(currentCodeplug));
    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];
    const currentSystem = currentCodeplug.systems.find(system => system.name === currentChannel.system);

    pcmPlayer.clear();

    console.debug("Connecting to master...");

    if (socket) {
        if (socket.readyState === WebSocket.OPEN) {
            isInSiteTrunking = false;
            console.log("Already connected?")
            return;
        }
    }

    socket = new WebSocket(`ws://${currentSystem.address}:${currentSystem.port}/client`);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
        isInSiteTrunking = false;
        setUiSiteTrunking(isInSiteTrunking);
        console.debug('WebSocket connection established');
        isVoiceGranted = false;
        isVoiceRequested = false;
        isVoiceGrantHandled = false;
        isTxing = false;
        // console.debug("Codeplug: " + currentCodeplug);
        startCheckLoop();
    };

    socket.onclose = () => {
        isInSiteTrunking = true;
        setUiSiteTrunking(isInSiteTrunking);
        isVoiceGranted = false;
        isVoiceRequested = false;
        isVoiceGrantHandled = false;
        isTxing = false;
        console.debug('WebSocket connection closed');
    }

    socket.onerror = (error) => {
        isInSiteTrunking = true;
        setUiSiteTrunking(isInRange);
        isVoiceGranted = false;
        isVoiceRequested = false;
        isVoiceGrantHandled = false;
        isTxing = false;
        console.error('WebSocket error:', error);
    }

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

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
                console.log(currentTg + " " + myRid);
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
                    const binaryString = atob(data.data.Data);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    handleAudioData(bytes.buffer);
                } else {
                    console.log("ingoring audio, not for us");
                }
            } else if (data.type === packetToNumber("GRP_VCH_RSP")) {
                if (data.data.SrcId !== myRid && data.data.DstId === currentTg && data.data.Status === 0 && !scanTgActive) {
                    isReceiving = true;
                    isReceivingParkedChannel = true;
                    currentFrequncyChannel = data.data.Channel;
                    isTxing = false;
                    haltAllLine3Messages = true;
                    document.getElementById("line3").style.color = "black";
                    document.getElementById("line3").innerHTML = `ID: ${data.data.SrcId}`;
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rx.png`;
                } else if (scanManager !== null && !isReceivingParkedChannel && (data.data.SrcId !== myRid && scanManager.isTgInCurrentScanList(currentZone.name, currentChannel.name, data.data.DstId)) && scanEnabled) {
                    console.log("Received GRP_VCH_RSP for TG in scan list");
                    scanTgActive = true;
                    isReceivingParkedChannel = false;
                    isReceiving = true;
                    currentFrequncyChannel = data.data.Channel;
                    isTxing = false;
                    haltAllLine3Messages = true;
                    setLine1(scanManager.getChannelAndZoneForTgInCurrentScanList(currentZone.name, currentChannel.name, data.data.DstId).zone);
                    setLine2(scanManager.getChannelAndZoneForTgInCurrentScanList(currentZone.name, currentChannel.name, data.data.DstId).channel);
                    document.getElementById("line3").style.color = "black";
                    document.getElementById("line3").innerHTML = `ID: ${data.data.SrcId}`;
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rx.png`;
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
                    isVoiceRequested = false;
                    isVoiceGranted = true;
                    setTimeout(() => {
                        if (isTxing) {
                            tpt_generate();
                            document.getElementById("rssi-icon").src = `models/${radioModel}/icons/tx.png`;
                        } else {
                            console.log("After 2ms isTxing = false, boking");
                            document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
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
                    pcmPlayer.clear();
                } else if (scanManager !== null && !isReceivingParkedChannel && (data.data.SrcId !== myRid && scanManager.isTgInCurrentScanList(currentZone.name, currentChannel.name, data.data.DstId)) && scanEnabled) {
                    haltAllLine3Messages = false;
                    scanTgActive = false;

                    if (!isInRange) {
                        setUiOOR(isInRange);
                    } else if (isInSiteTrunking) {
                        setUiSiteTrunking(isInSiteTrunking);
                    } else {
                        document.getElementById("line3").innerHTML = '';
                    }

                    isReceiving = false;
                    currentFrequncyChannel = null;

                    setLine1(currentZone.name);
                    setLine2(currentChannel.name);
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
                    pcmPlayer.clear();
                } else if (data.data.SrcId === myRid && data.data.DstId === currentTg) {
                    isVoiceGranted = false;
                    isVoiceRequested = false;
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
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
                    SendAckResponse(packetToNumber("CALL_ALRT"));
                    SendAckResponse(packetToNumber("CALL_ALRT"));

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
                    SendAckResponse(packetToNumber("SPEC_FUNC"), 0x01); // inhibit = 0x01
                    inhibited = true;
                    powerOff(true).then();
                } else if (data.data.DstId.toString() === myRid && data.data.Function === 0x02 && Number(data.data.SrcId) === FNE_ID) {
                    console.log("Unit UNINHIBITED");
                    SendAckResponse(packetToNumber("SPEC_FUNC"), 0x02); // uninhibit = 0x01
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
                if (data.data.VoiceChannel.SrcId.toString() !== myRid && data.data.VoiceChannel.DstId.toString() === currentTg
                        && isAffiliated && isRegistered && isInRange && !isReceiving && !isTxing) {
                    isReceiving = true;
                    currentFrequncyChannel = data.data.VoiceChannel.Frequency;
                    isTxing = false;
                    haltAllLine3Messages = true;
                    document.getElementById("line3").style.color = "black";
                    document.getElementById("line3").innerHTML = `ID: ${data.data.VoiceChannel.SrcId}`;
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
    } else {
        console.debug('Received empty audio data array');
    }
}

function volumeUp() {
    if (volumeLevel < 1.0) {
        volumeLevel += 0.1;
        volumeLevel = Math.min(1.0, volumeLevel);
        //beepAudioCtx.gainNode.gain.value = volumeLevel;
        pcmPlayer.volume(volumeLevel);
        console.log(`Volume increased: ${volumeLevel}`);
    }
}

function volumeDown() {
    if (volumeLevel > 0.0) {
        volumeLevel -= 0.1;
        volumeLevel = Math.max(0.1, volumeLevel);
        //beepAudioCtx.gainNode.gain.value = volumeLevel;
        pcmPlayer.volume(volumeLevel);
        console.log(`Volume decreased: ${volumeLevel}`);
    }
}

function beep(frequency, duration, volume, type) {
    const oscillator = beepAudioCtx.createOscillator();
    const gainNode = beepAudioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(beepAudioCtx.destination);
    gainNode.gain.value = Math.max(0.1, volumeLevel - 0.3);
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


function playSoundEffect(audioPath) {
    let audio = new Audio(audioPath);
    audio.play().then();
}


function knobClick() {
    playSoundEffect('audio/knob-click.wav');
}

function scanOn() {
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

    if (currentRssiLevel !== null) {
        rssiIcon.src = `models/${model}/icons/rssi${currentRssiLevel}.png`;
    } else {
        rssiIcon.src = `models/${model}/icons/rssi${currentRssiLevel}.png`;
    }

    console.log("Loaded model assets");
}
