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
* Copyright (C) 2024 Caleb, K4PHP
*
*/

const pcmPlayer = new PCMPlayer({encoding: '16bitInt', channels: 1, sampleRate: 8000});
const EXPECTED_PCM_LENGTH = 1600;
const CHUNK_SIZE = 320;
const HOST_VERSION = "R01.02.00";

const beepAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

const rssiIcon = document.getElementById('rssi-icon');

let socket;
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

let affiliationCheckInterval;
let registrationCheckInterval;
let groupGrantCheckInterval;
let batteryLevelInterval;
let reconnectInterval;

let myRid = "1234";
let currentTg = "2001";
let radioModel;
let currentRssiLevel = "0";
let currentDbLevel;
let batteryLevel = 4;
let currentSite;
let initialized = false;

function socketOpen() {
    return socket && socket.readyState === WebSocket.OPEN;
}

reconnectInterval = setInterval(() => {
    if (isInSiteTrunking && radioOn) {
        connectWebSocket();
    }
}, 2000);

batteryLevelInterval = setInterval(() => {
    if (!radioOn) {
        return;
    }

    if (batteryLevel > 0) {
        batteryLevel--;
        document.getElementById("battery-icon").src = `models/${radioModel}/icons/battery${batteryLevel}.png`;
    } else {
        powerOff().then(r => {});
    }
    // console.log(`Battery level: ${batteryLevel}`);
}, 3600000);

function startCheckLoop() {
    if (!socketOpen() || !isInRange || !radioOn) {
        return;
    }

    setTimeout(() => {
        sendRegistration().then(() => {
            setTimeout(() => {
                if (isRegistered) {
                    sendAffiliation().then(() => {
                    });
                } else {
                    document.getElementById('line3').innerHTML = 'Sys reg refusd';
                }
            }, 800);
        });
    }, 200);

    affiliationCheckInterval = setInterval(() => {
        if (!socketOpen() || !isInRange || !radioOn) {
            return;
        }

        if (!isAffiliated && isRegistered) {
            sendAffiliation().then(() => {
            });
        }
    }, 5000);

    registrationCheckInterval = setInterval(() => {
        if (!socketOpen() || !isInRange || !radioOn) {
            return;
        }

        if (!isRegistered) {
            sendRegistration().then(r => {
            });
            setTimeout(() => {
                if (!isRegistered) {
                    document.getElementById('line3').innerHTML = 'Sys reg refusd';
                }
            }, 800);
        } else {
            document.getElementById('line3').innerHTML = '';
        }
    }, 5000);

    /*    groupGrantCheckInterval = setInterval(() => {
            // if (isVoiceRequested && !isVoiceGranted && !isVoiceGrantHandled) {
            //     document.getElementById("rssi-icon").src = `models/${radioModel}/icons/tx.png`;
            //     SendGroupVoiceRequest();
            //
            //     if (!isVoiceGranted && isVoiceRequested) {
            //         setTimeout(() => {
            //             document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
            //         }, 400);
            //     }
            //
            //     setTimeout(() => {
            //         if (!isVoiceGranted && !isTxing && isVoiceRequested) {
            //             isVoiceRequested = false;
            //             isVoiceGranted = false;
            //             isTxing = false;
            //             bonk();
            //         }
            //     }, 3000);
            // }

            if (isVoiceGranted && isTxing && !isVoiceGrantHandled) {
                document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
                isVoiceRequested = false;
                isVoiceGranted = true;
                setTimeout(() => {
                    tpt_generate();
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/tx.png`;
                }, 250);
                isVoiceGrantHandled = true;
            }
        }, 300);*/
}

function stopCheckLoop() {
    clearInterval(affiliationCheckInterval);
    clearInterval(registrationCheckInterval);
    clearInterval(groupGrantCheckInterval);
}

async function sendAffiliation() {
    try {
        rssiIcon.src = `models/${radioModel}/icons/tx.png`;
        await SendGroupAffiliationRequest();
        setTimeout(() => {
            rssiIcon.src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
        }, 150);
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
        }, 150);
    } catch (error) {
        console.error('Error sending registration:', error);
    }
}

window.addEventListener('message', async function (event) {
    if (event.data.type === 'resetBatteryLevel'){
        batteryLevel = 4;
    } else if (event.data.type === 'openRadio') {
        currentCodeplug = event.data.codeplug;

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

        loadRadioModelAssets(radioModel);

        document.getElementById('radio-container').style.display = 'block';
    } else if (event.data.type === 'closeRadio') {
        document.getElementById('radio-container').style.display = 'none';
    } else if (event.data.type === "pttPress") {
        if (!isInRange || !isRegistered) {
            console.debug("Not in range, not txing");
            bonk();
            return;
        }

        if (isReceiving) {
            console.debug("Receiving, not txing");
            bonk();
            return;
        }

        if (!isInSiteTrunking) {
            document.getElementById("rssi-icon").src = `models/${radioModel}/icons/tx.png`;
            setTimeout(() => {
                SendGroupVoiceRequest();
                isVoiceRequested = true;
                isVoiceGranted = false;
            }, 200);
        } else {
            isVoiceGranted = false;
            isVoiceRequested = true;
        }
    } else if (event.data.type === "pttRelease") {
        isVoiceGrantHandled = false;

        if (isTxing && isRegistered) {
            SendGroupVoiceRelease();
            currentFrequncyChannel = null;
        } else {
            console.debug("not txing not releasing");
        }

        isTxing = false;
    } else if (event.data.type === 'showStartupMessage') {
        document.getElementById('startup-message').style.display = 'block';
    } else if (event.data.type === 'hideStartupMessage') {
        document.getElementById('startup-message').style.display = 'none';
    } else if (event.data.type === 'setRid') {
        myRid = event.data.rid;
    } else if (event.data.type === 'setModel') {
        currentCodeplug = event.data.currentCodeplug;
        loadRadioModelAssets(event.data.model);
        radioModel = event.data.model;
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

        if (currentRssiLevel !== null && currentRssiLevel === parseInt(event.data.level)) {
            // console.debug("RSSI Level not changed")
            return;
        }

        if (siteChanged && isRegistered && !isInSiteTrunking) {
            sendAffiliation().then(r => {});
        }

        currentRssiLevel = event.data.level;
        currentDbLevel = event.data.dbRssi;
        rssiIcon.src = `models/${radioModel}/icons/rssi${event.data.level}.png`;
    }
});

async function powerOn() {
    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];

    if (!initialized) {
        micCapture.captureMicrophone(() => {
            console.log('Microphone captured');
        });
    }

    const bootScreenMessages = [
        {text: "", duration: 0, line: "line1"},
        {text: "", duration: 0, line: "line3"},
        {text: HOST_VERSION, duration: 1500, line: "line2"},
        {text: radioModel, duration: 1500, line: "line2"}
    ];

    await displayBootScreen(bootScreenMessages);
    currentMessageIndex = 0;

    responsiveVoice.speak(`${currentZone.name}`, `US English Female`, {rate: .8});
    responsiveVoice.speak(`${currentChannel.name}`, `US English Female`, {rate: .8});

    updateDisplay();
    document.getElementById("softText1").innerHTML = 'ZnUp';
    document.getElementById("softText2").innerHTML = 'RSSI';
    document.getElementById("softText3").innerHTML = 'ChUp';
    document.getElementById("softText1").style.display = 'block';
    document.getElementById("softText2").style.display = 'block';
    document.getElementById("softText3").style.display = 'block';
    document.getElementById("line1").style.display = 'block';
    document.getElementById("line2").style.display = 'block';
    document.getElementById("line3").style.display = 'block';
    document.getElementById("battery-icon").style.display = 'block';
    document.getElementById("battery-icon").src = `models/${radioModel}/icons/battery${batteryLevel}.png`;
    radioOn = true;
    initialized = true;
    rssiIcon.style.display = 'block';
    connectWebSocket();
}

async function powerOff() {
    stopCheckLoop();
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
    document.getElementById("line1").innerHTML = '';
    document.getElementById("line2").innerHTML = '';
    document.getElementById("line3").innerHTML = '';
    document.getElementById("line1").style.display = 'none';
    document.getElementById("line2").style.display = 'none';
    document.getElementById("line3").style.display = 'none';
    document.getElementById("rssi-icon").style.display = 'none';
    document.getElementById("battery-icon").style.display = 'none';
    document.getElementById("softText1").innerHTML = '';
    document.getElementById("softText2").innerHTML = '';
    document.getElementById("softText3").innerHTML = '';
    document.getElementById("softText1").style.display = 'none';
    document.getElementById("softText2").style.display = 'none';
    document.getElementById("softText3").style.display = 'none';
    await SendDeRegistrationRequest();
    disconnectWebSocket();
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
    console.log("Key event")
    if (event.key === 'Escape') {
        console.log("Sending fetch" + `https://${GetParentResourceName()}/unFocus`);
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
        powerOff().then(r => console.log("Radio off"));
    } else {
        powerOn().then(r => console.log("Radio on"));
    }
});

document.getElementById('btn-emer').addEventListener('click', () => {
    emergency_tone_generate();
    SendEmergencyAlarmRequest();
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
    buttonBeep();
    const line3 = document.getElementById('line3');
    line3.style.backgroundColor = '';
    line3.style.color = 'black';
    line3.innerHTML = `SITE: ${currentSite.siteID}`;
    setTimeout(() => {
        line3.innerHTML = `RSSI: ${Math.round(currentDbLevel)} dBm`;
    }, 2000);
    setTimeout(() => {
        if (!isInRange) {
            setUiOOR(isInRange);
        } else if (isInSiteTrunking) {
            setUiSiteTrunking(isInSiteTrunking);
        } else {
            line3.innerHTML = '';
        }
    }, 4000);
});

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
        sendAffiliation().then(r => {
        });
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

    document.getElementById('line1').innerText = currentZone.name;
    document.getElementById('line2').innerText = currentChannel.name;
    currentTg = currentChannel.tgid;
}

function reconnectIfSystemChanged() {
    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];
    const currentSystem = currentCodeplug.systems.find(system => system.name === currentChannel.system);

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

    console.debug("Connecting to master...");
    if (socket && socket.readyState === WebSocket.OPEN) {
        isInSiteTrunking = false;
        console.log("Already connected?")
        return;
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
            // console.debug(`Received master message: ${event.data}`);

            if (!isInRange || !radioOn) {
                console.debug("Not in range or powered off, not processing message");
                return;
            }

            if (data.type == packetToNumber("GRP_AFF_RSP")) {
                if (data.data.SrcId !== myRid || data.data.DstId !== currentTg) {
                    return;
                }

                if (data.data.Status === 0) {
                    isAffiliated = true;
                    console.debug("Affiliation granted");
                } else {
                    isAffiliated = false;
                    console.debug("Affiliation denied");
                }
            } else if (data.type == packetToNumber("U_REG_RSP")) {
                if (data.data.SrcId !== myRid) {
                    return;
                }

                if (data.data.Status === 0) {
                    isRegistered = true;
                    console.debug("Registration granted");
                } else {
                    isRegistered = false;
                    console.debug("Registration refused");
                }
            } else if (data.type == packetToNumber("AUDIO_DATA")) {
                if (data.voiceChannel.SrcId !== myRid && data.voiceChannel.DstId == currentTg && data.voiceChannel.Frequency == currentFrequncyChannel) {
                    const binaryString = atob(data.data);
                    const len = binaryString.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    handleAudioData(bytes.buffer);
                }
            } else if (data.type == packetToNumber("GRP_VCH_RSP")) {
                if (data.data.SrcId !== myRid && data.data.DstId === currentTg && data.data.Status === 0) {
                    isReceiving = true;
                    currentFrequncyChannel = data.data.Channel;
                    isTxing = false;
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
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
                    isVoiceRequested = false;
                    isVoiceGranted = true;
                    setTimeout(() => {
                        tpt_generate();
                        document.getElementById("rssi-icon").src = `models/${radioModel}/icons/tx.png`;
                    }, 200);
                    isVoiceGrantHandled = true;
                    /*                    } else {
                                            isTxing = false;
                                            isVoiceGranted = false;
                                        }*/
                } else if (data.data.SrcId === myRid && data.data.DstId === currentTg && data.data.Status !== 0) {
                    bonk();
                }
            } else if (data.type == packetToNumber("GRP_VCH_RLS")) {
                if (data.data.SrcId !== myRid && data.data.DstId === currentTg) {
                    if (!isInRange) {
                        setUiOOR(isInRange);
                    } else if (isInSiteTrunking) {
                        setUiSiteTrunking(isInSiteTrunking);
                    } else {
                        document.getElementById("line3").innerHTML = '';
                    }
                    isReceiving = false;
                    currentFrequncyChannel = null;
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
                } else if (data.data.SrcId === myRid && data.data.DstId === currentTg) {
                    isVoiceGranted = false;
                    isVoiceRequested = false;
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
                }
            } else if (data.type == packetToNumber("EMRG_ALRM_RSP")) {
                if (data.data.SrcId !== myRid && data.data.DstId == currentTg) {
                    const line3 = document.getElementById("line3");
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
                    }, 5000);
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

function setUiSiteTrunking(inSt) {
    const line3 = document.getElementById('line3');

    if (!isInRange) {
        return;
    }

    if (!inSt) {
        line3.innerHTML = '';
        line3.style.backgroundColor = '';
    } else {
        line3.innerHTML = 'Site trunking';
        line3.style.color = 'black';
        line3.style.backgroundColor = '';
    }
}

function handleAudioData(data) {
    const dataArray = new Uint8Array(data);

    if (dataArray.length > 0) {
        pcmPlayer.feed(dataArray);
    } else {
        console.debug('Received empty audio data array');
    }
}

function beep(frequency, duration, volume, type) {
    var oscillator = beepAudioCtx.createOscillator();
    var gainNode = beepAudioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(beepAudioCtx.destination);
    vol = 1;
    gainNode.gain.value = vol;
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

function onAudioFrameReady(buffer, rms) {
    if (isTxing && currentFrequncyChannel !== null) {

        if (fringVC) {
            const degradedBuffer = simulateFringeCoverage(buffer, 8000);
            audioBuffer.push(...degradedBuffer);
        } else {
            audioBuffer.push(...buffer);
        }

        if (audioBuffer.length >= EXPECTED_PCM_LENGTH) {
            const fullFrame = audioBuffer.slice(0, EXPECTED_PCM_LENGTH);
            audioBuffer = audioBuffer.slice(EXPECTED_PCM_LENGTH);

            const response = {
                type: 1,
                rms: rms * 30.0,
                voiceChannel: {
                    SrcId: myRid,
                    DstId: currentTg,
                    Frequency: currentFrequncyChannel
                },
                site: currentSite,
                data: fullFrame
            };

            const jsonString = JSON.stringify(response);
            socket.send(jsonString);
        }
    } else {
        // console.debug("Skipping audio send; not permitted to send");
    }
}

function disconnectWebSocket() {
    if (socket) {
        socket.close();
        socket = null;
    }
}

function buttonBeep() {
    playSoundEffect('buttonbeep.wav');
}


function playSoundEffect(audioPath) {
    var audio = new Audio(audioPath);
    audio.play();
}


function knobClick() {
    playSoundEffect('knob-click.wav');
}


function playSoundEffect(audioPath) {
    var audio = new Audio(audioPath);
    audio.play();
}


function buttonBonk() {
    playSoundEffect('buttonbonk.wav');
}


function playSoundEffect(audioPath) {
    var audio = new Audio(audioPath);
    audio.play();
}

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
}
