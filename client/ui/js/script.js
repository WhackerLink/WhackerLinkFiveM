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
* Copyright (C) 2024-2026 Caleb, K4PHP
*
*/

const pcmPlayer = new PCMPlayer({encoding: '16bitInt', channels: 1, sampleRate: 8000});
const micCapture = new MicCapture(onAudioFrameReady);

const EXPECTED_PCM_LENGTH = 1600;
const CONV_PCM_LENGTH = 320;
const MAX_BUFFER_SIZE = EXPECTED_PCM_LENGTH * 2;
const MDC_LEAD_SILENCE_SAMPLES = 0;
const MDC_TAIL_SILENCE_SAMPLES = 0;
const MDC_PREAMBLE_BYTES = 0;
const MDC_VOICE_DELAY_MS = 260;

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
let isOnConvChannel = false;

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
let currentConvFreq = "";
let currentConvRxSrcId = null;
let mdcDecoder = null;
let mdcPttSent = false;
let mdcVoiceHoldUntil = 0;
let socketMode = null;

let currentLat = null;
let currentLng = null;

let inhibited = false;

let isPaging = false;
let isAlertPlaying = false;
let isTonePlaying = false;
let tonesQueue = [];

function socketOpen() {
    return socket && socket.readyState === WebSocket.OPEN;
}

function resetMdcDecoder() {
    mdcDecoder = null;
}

function resetConvReceive() {
    currentConvRxSrcId = null;
    resetMdcDecoder();
}

function getCurrentZone() {
    if (!currentCodeplug || !currentCodeplug.zones) return null;
    return currentCodeplug.zones[currentZoneIndex];
}

function getCurrentChannel() {
    const currentZone = getCurrentZone();
    if (!currentZone || !currentZone.channels) return null;
    return currentZone.channels[currentChannelIndex];
}

function getSystemForChannel(channel) {
    if (!channel || !currentCodeplug || !currentCodeplug.systems) return null;
    return currentCodeplug.systems.find(system => system.name === channel.system) || null;
}

function getCurrentSystem() {
    return getSystemForChannel(getCurrentChannel());
}

function getSystemMode(system) {
    if (!system || !system.mode) return "trunking";
    return system.mode.toString().toLowerCase();
}

function isConventionalMode(mode) {
    return mode === "conv" || mode === "conventional" || mode === "mdcconv";
}

function isCurrentConventional() {
    return isConventionalMode(getSystemMode(getCurrentSystem()));
}

function normalizeFrequency(frequency) {
    if (frequency == null) return null;

    const parsed = Number(frequency);
    if (!Number.isNaN(parsed))
        return parsed.toFixed(5).replace(/0+$/, "").replace(/\.$/, "");

    return frequency.toString();
}

function frequenciesMatch(a, b) {
    const freqA = normalizeFrequency(a);
    const freqB = normalizeFrequency(b);

    return freqA !== null && freqB !== null && freqA === freqB;
}

function getCurrentChannelFrequency() {
    const currentChannel = getCurrentChannel();
    if (!currentChannel || currentChannel.frequency == null) return null;
    return normalizeFrequency(currentChannel.frequency);
}

function getCurrentMdcMode() {
    return getSystemMode(getCurrentSystem()) === "mdcconv" ? 0x01 : 0x00;
}

function isMdcVoiceMode(mode) {
    return mode === 0x01 || mode === "1" || mode === "ANALOG_MDC" || mode === "mdc" || mode === "mdcconv";
}

function getSystemAuthKey(system) {
    if (!system) return "";
    if (system.authKey != null) return system.authKey;
    if (!currentCodeplug || !currentCodeplug.systems) return "";

    const match = currentCodeplug.systems.find(other =>
        other !== system &&
        other.address === system.address &&
        other.port === system.port &&
        other.authKey != null
    );

    return match ? match.authKey : "";
}

function setTxIndicator() {
    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/tx.png`;

    if (isMobile() && radioModel !== "E5" && radioModel !== "APX4500-G") {
        redIcon.src = `models/${radioModel}/icons/red.png`;
        redIcon.style.display = 'block';
    }

    if (radioModel === "APXNext") {
        txBox.style.display = "block";
        rxBox.style.display = "none";
        txBox.style.backgroundColor = "red";
    }
}

function clearTxIndicator() {
    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
    if (isMobile()) redIcon.style.display = 'none';
    if (radioModel === "APXNext") {
        txBox.style.display = "none";
    }
}

let beepVolumeReduction = 0.6; // default value
let audioGainConfig = {
    enabled: true,
    inputGain: 1.0,
    outputGain: 1.0
};

fetch('/configs/config.yml')
  .then(response => response.text())
  .then(yamlText => {
    const lines = yamlText.split('\n');
    let inAudioGainSection = false;
    
    for (const line of lines) {
      // Parse beepVolumeReduction
      const matchBeepVolume = line.match(/^\s*beepVolumeReduction\s*:\s*([0-9.]+)\s*$/i);
      if (matchBeepVolume) {
        let parsed = parseFloat(matchBeepVolume[1]);
        if (isNaN(parsed)) {
          console.error('beepVolumeReduction in config.yml is not a number. Using default value.');
          return;
        }
        if (parsed < 0.0) {
          console.error('beepVolumeReduction in config.yml is less than 0. Clamping to 0.');
          beepVolumeReduction = 0.0;
        } else if (parsed > 1.0) {
          console.error('beepVolumeReduction in config.yml is greater than 1. Clamping to 1.');
          beepVolumeReduction = 1.0;
        } else {
          beepVolumeReduction = parsed;
        }
      }
      
      // Parse audioGain section
      if (line.match(/^\s*audioGain\s*:\s*$/i)) {
        inAudioGainSection = true;
        continue;
      }
      
      if (inAudioGainSection) {
        if (line.match(/^\s*[a-zA-Z]+\s*:\s*/) && !line.match(/^\s{2}/)) {
          // We've hit a new top-level section, exit audioGain section
          inAudioGainSection = false;
        } else {
          // Parse audioGain properties
          const matchEnabled = line.match(/^\s+enabled\s*:\s*(true|false)\s*$/i);
          const matchInputGain = line.match(/^\s+inputGain\s*:\s*([0-9.]+)\s*$/i);
          const matchOutputGain = line.match(/^\s+outputGain\s*:\s*([0-9.]+)\s*$/i);
          
          if (matchEnabled) {
            audioGainConfig.enabled = matchEnabled[1].toLowerCase() === 'true';
          } else if (matchInputGain) {
            let parsed = parseFloat(matchInputGain[1]);
            if (!isNaN(parsed) && parsed >= 0.1 && parsed <= 10.0) {
              audioGainConfig.inputGain = parsed;
            } else {
              console.warn('Invalid inputGain value in config.yml. Using default 1.0');
            }
          } else if (matchOutputGain) {
            let parsed = parseFloat(matchOutputGain[1]);
            if (!isNaN(parsed) && parsed >= 0.1 && parsed <= 5.0) {
              audioGainConfig.outputGain = parsed;
            } else {
              console.warn('Invalid outputGain value in config.yml. Using default 1.0');
            }
          }
        }
      }
    }
    
    // Apply audio gain settings to PCM player
    if (audioGainConfig.enabled) {
      pcmPlayer.setOutputGain(audioGainConfig.outputGain);
      console.log('Audio gain configured:', audioGainConfig);
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
    return radioModel === "UNIG5" || radioModel === "MIN6";
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
            resetConvReceive();
        }
    }, 1000);

    setTimeout(() => {
        if (isCurrentConventional()) {
            isRegistered = true;
            isAffiliated = true;
            return;
        }

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
        if (!socketOpen() || !isInRange || !radioOn || !isRegistered || isCurrentConventional()) {
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
        if (!socketOpen() || !isInRange || !radioOn || isCurrentConventional()) {
            return;
        }

        if (!isAffiliated && isRegistered) {
            sendAffiliation().then(() => {
            });
        }
    }, 5000);

    let clearedDisplay = false;

    registrationCheckInterval = setInterval(() => {
        if (!socketOpen() || !isInRange || !radioOn || isCurrentConventional()) {
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
    if (isCurrentConventional())
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
    if (isCurrentConventional()) {
        isRegistered = true;
        return;
    }

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

        if (!isCurrentConventional() && !isRegistered) {
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

        if (isCurrentConventional()) {
            const frequency = getCurrentChannelFrequency();
            if (frequency === null) {
                console.warn("Conventional channel missing frequency");
                bonk();
                isVoiceGrantHandled = false;
                return;
            }

            currentFrequncyChannel = frequency;
            currentConvFreq = frequency;
            mdcPttSent = false;
            mdcVoiceHoldUntil = 0;
            audioBuffer = [];
            isVoiceRequested = false;
            isVoiceGranted = true;
            isTxing = true;
            setTxIndicator();
        } else if (!isInSiteTrunking) {
            setTxIndicator();

            await sleep(50);

            if (!isVoiceRequested && !isVoiceGranted) {
                SendGroupVoiceRequest();
                isVoiceRequested = true;
                isVoiceGranted = false;

                // This should prevent the 'stuck' state you can get in when trying to transmit while someone else already is
                setTimeout(() => {
                    if (isVoiceRequested && !isVoiceGranted) {
                        console.debug("did not get response from WLS within 5 seconds"); // Timing might need tweaking I think 5 seconds is a fair timeout for most cases
                        bonk()
                        isVoiceRequested = false;
                        isVoiceGrantHandled = false;
                    }
                }, 5000);
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

        isVoiceGrantHandled = false;

        if (isTxing && isCurrentConventional()) {
            await sleep(25);
            isTxing = false;
            isVoiceGranted = false;
            SendConvVoiceTerm(myRid, currentTg, getCurrentMdcMode(), currentFrequncyChannel);
            mdcPttSent = false;
            mdcVoiceHoldUntil = 0;
        } else if (isTxing && isRegistered) {
            await sleep(655); // Temp fix to ensure all voice data makes it through before releasing; Is this correct?
                                  // Should we check if the audio buffer is empty instead? Now I am just talking to myself..
            SendGroupVoiceRelease();
            currentFrequncyChannel = null;
        } else {
            console.debug("not txing not releasing");
        }

        clearTxIndicator();
        isTxing = false;
        isVoiceGranted = false;
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
    } else if (event.data.type === "manDownState"){
        if (event.data.active) {
            StartEmergencyAlarm(); // TODO: Add pre-alarm like apx has etc
            console.log("man down active");
        }
        else
            console.log("reset man down"); // TODO: handle at some point
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
                {text: "", duration: 0, line: "line1"},
                {text: "", duration: 0, line: "line3"},
                {text: HOST_VERSION, duration: 1500, line: "line2"},
                {text: radioModel, duration: 1500, line: "line2"}
            ];

            await displayBootScreen(bootScreenMessages);
        }

        if (!isScannerModel()) {
            // responsiveVoice.speak(`${currentZone.name}`, `US English Female`, {rate: .8});
            // responsiveVoice.speak(`${currentChannel.name}`, `US English Female`, {rate: .8});
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

        if (reReg && !isCurrentConventional()) {
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
        if (!stayConnected && !isCurrentConventional())
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
    if (isCurrentConventional())
        return;

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
    const previousTg = currentTg;
    const previousConv = isOnConvChannel;

    isTxing = false;
    isReceiving = false;
    isReceivingParkedChannel = false;
    resetConvReceive();

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

    const currentChannel = currentZone.channels[currentChannelIndex];

    // responsiveVoice.speak(`${currentChannel.name}`, `US English Female`, {rate: .8});

    if (!previousConv && previousTg !== null) {
        SendGroupAffiliationRemoval(previousTg);
    }

    updateDisplay();

    if (!isCurrentConventional() && !isInSiteTrunking) {
        sendAffiliation().then();
    } else if (isCurrentConventional()) {
        isRegistered = true;
        isAffiliated = true;
    } else {
        isAffiliated = false;
    }
    reconnectIfSystemChanged();
}

function changeZone(direction) {
    const previousTg = currentTg;
    const previousConv = isOnConvChannel;

    isTxing = false;
    isReceiving = false;
    isReceivingParkedChannel = false;
    resetConvReceive();

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
    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];

    // responsiveVoice.speak(`${currentZone.name}`, `US English Female`, {rate: .8});
    // responsiveVoice.speak(`${currentChannel.name}`, `US English Female`, {rate: .8});
    if (!previousConv && previousTg !== null) {
        SendGroupAffiliationRemoval(previousTg);
    }

    updateDisplay();

    if (!isCurrentConventional() && !isInSiteTrunking) {
        sendAffiliation().then();
    } else if (isCurrentConventional()) {
        isRegistered = true;
        isAffiliated = true;
    } else {
        isAffiliated = false;
    }
    
    reconnectIfSystemChanged();
}

function updateDisplay() {
    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];
    const currentSystem = getSystemForChannel(currentChannel);

    setLine1(currentZone.name);
    setLine2(currentChannel.name);
    isOnConvChannel = isConventionalMode(getSystemMode(currentSystem));

    if (isOnConvChannel) {
        currentTg = currentChannel.tgid != null ? currentChannel.tgid.toString() : null;
        currentFrequncyChannel = currentChannel.frequency != null ? currentChannel.frequency.toString() : null;
        currentConvFreq = currentFrequncyChannel || "";
        isRegistered = true;
        isAffiliated = true;
        resetConvReceive();
    } else {
        currentTg = currentChannel.tgid.toString();
        currentFrequncyChannel = null;
        currentConvFreq = "";
        resetConvReceive();
    }
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
    const currentSystem = getCurrentSystem();
    if (currentSystem === null) {
        setLine2("Fail 01/82");
        return;
    }

    pcmPlayer.clear();
    resetConvReceive();

    const hashedAuthKey = await hashKey(getSystemAuthKey(currentSystem));
    const masterEndpoint = `ws://${currentSystem.address}:${currentSystem.port}/client?authKey=${encodeURIComponent(hashedAuthKey)}`;
    const desiredMode = isCurrentConventional() ? "conv" : "trunking";

    if (socket && (socket.url !== masterEndpoint || socketMode !== desiredMode)) {
        connectWebSocket();
        return;
    }

    if (socketOpen() && isCurrentConventional()) {
        socket.send("CONVENTIONAL_PEER_ENABLE");
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

    const hashedAuthKey = await hashKey(getSystemAuthKey(currentSystem));
    const masterEndpoint = `ws://${currentSystem.address}:${currentSystem.port}/client?authKey=${encodeURIComponent(hashedAuthKey)}`;
    const connectedMode = isCurrentConventional() ? "conv" : "trunking";

    console.debug(`Opening ${connectedMode} websocket to ${currentSystem.address}:${currentSystem.port}`);
    socket = new WebSocket(masterEndpoint);
    socket.binaryType = 'arraybuffer';
    socketMode = connectedMode;

    socket.onopen = event => {
        if (event.currentTarget !== socket) return;

        if (isScannerModel() || connectedMode === "conv"){
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
        if (!isScannerModel() && connectedMode !== "conv")
            startCheckLoop();
        pcmPlayer.clear();
    };

    socket.onclose = event => {
        if (event.currentTarget !== socket) return;

        console.debug(`WebSocket connection closed: ${event.code} ${event.reason || ""} (${socketMode || "unknown"})`);
        socket = null;
        socketMode = null;
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
        pcmPlayer.clear();
        resetConvReceive();
    }

    socket.onerror = (error) => {
        if (error.currentTarget !== socket) return;

        socket = null;
        socketMode = null;
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
        resetConvReceive();
    }

    socket.onmessage = (event) => {
        if (event.currentTarget !== socket) return;

        if (typeof event.data !== 'string') {
            return;
        }

        let data;
        try {
            data = JSON.parse(event.data);
        } catch {
            console.debug("Received non-json message from master:", event.data);
            return;
        }

        const currentZone = currentCodeplug.zones[currentZoneIndex];
        const currentChannel = currentZone.channels[currentChannelIndex];
        const currentSystem = currentCodeplug.systems.find(system => system.name === currentChannel.system);

        if (data) {
            // console.debug(`Received WlinkPacket from master: ${event.data}`);

            // allow sts bcast so we know to turn a site back on (Fail rp ikr! chris would NOT approve)
            // allow SPEC_FUNC so we know to uninhibit the radio
            // 0x21 = WlinkPacket STS_BCAST
            // 0x22 = WlinkPacket SPEC_FUNC
            if ((!isInRange || !radioOn) && data.type !== 0x21 && data.type !== 0x22) {
                console.debug("Not in range or powered off, not processing message from master");
                return;
            }

            // Conventional
            if (data.type === packetToNumber("CONV_VOICE")) {
                if (!isCurrentConventional()) {
                    return;
                }

                if (data.data.SrcId != null && data.data.SrcId.toString() === myRid.toString())
                    return;

                const isMdc = isMdcVoiceMode(data.data.Mode);

                if (!isMdc){
                    console.warn("Only MDC analog is supported for conv right now! invalid CONV_VOICE mode..")
                }

                if (!frequenciesMatch(currentConvFreq, data.data.Frequency)){
                    return;
                }

                const packetFrequency = normalizeFrequency(data.data.Frequency);
                if (currentConvFreq !== packetFrequency) {
                    currentConvFreq = packetFrequency;
                    resetConvReceive();
                }

                if (data.data.SrcId != null && !isReceiving) {
                    currentConvRxSrcId = data.data.SrcId.toString();
                    showConvSrcId(currentConvRxSrcId);
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rx.png`;
                    if (radioModel === "APXNext") rxBox.style.display = "block";
                    if (isMobile()) {
                        yellowIcon.src = `models/${radioModel}/icons/yellow.png`;
                        yellowIcon.style.display = 'block';
                    }
                }

                // for now, just play it. we will worry about gating it later.... TODO TODO TODO
                lastAudioTime = Date.now();
                isReceiving = true;
                const binaryString = atob(data.data.Data);
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                handleAudioData(bytes.buffer, isMdc);
            }
            else if (data.type === packetToNumber("CONV_VOICE_TERM")) {
                if (!isCurrentConventional())
                    return;

                if (!frequenciesMatch(currentConvFreq, data.data.Frequency))
                    return;

                isReceiving = false;
                isReceivingParkedChannel = false;
                scanTgActive = false;
                resetConvReceive();
                pcmPlayer.clear();

                if (!isInRange) {
                    setUiOOR(isInRange);
                } else if (isInSiteTrunking) {
                    setUiSiteTrunking(isInSiteTrunking);
                } else {
                    haltAllLine3Messages = false;
                    document.getElementById("line3").innerHTML = '';
                }

                document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi${currentRssiLevel}.png`;
                yellowIcon.style.display = 'none';
                rxBox.style.display = "none";
            }

            // Trunking
            else if (data.type === packetToNumber("GRP_AFF_RSP")) {
                if (isCurrentConventional() || currentTg == null)
                    return;

                //console.log(currentTg + " " + myRid);
                if (data.data.SrcId?.toString().trim() !== myRid.toString().trim() || data.data.DstId?.toString().trim() !== currentTg.toString()) {
                    return;
                }

                console.log("Affiliation accepted");
                isAffiliated = data.data.Status === 0;
            } else if (data.type === packetToNumber("U_REG_RSP")) {
                if (isCurrentConventional())
                    return;

                if (data.data.SrcId !== myRid) {
                    return;
                }

                isRegistered = data.data.Status === 0;
            } else if (data.type === packetToNumber("AUDIO_DATA")) {
                if (isCurrentConventional())
                    return;

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
                if (isCurrentConventional())
                    return;

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
                if (isCurrentConventional())
                    return;

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
                if (isCurrentConventional())
                    return;

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

    if (!inSt) {
        haltAllLine3Messages = false;
        line3.innerHTML = '';
        line3.style.backgroundColor = '';
    } else {
        if (!haltAllLine3Messages) {
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

function handleMdcPacket(packet) {
    if (!packet) return;

    const srcId = packet.unitID.toString();
    currentConvRxSrcId = currentConvRxSrcId || srcId;
    showConvSrcId(srcId);
}

function showConvSrcId(srcId) {
    if (srcId == null) return;

    const line3 = document.getElementById("line3");
    haltAllLine3Messages = true;

    if (isScannerModel()) {
        line3.style.color = "white";
        line3.innerHTML = `Fm:[${srcId}]`;
    } else {
        line3.style.color = "black";
        line3.innerHTML = `ID: ${srcId}`;
    }
}

function processMdcData(dataArray) {
    if (typeof Mdc1200 === 'undefined') {
        return;
    }

    if (mdcDecoder === null) {
        mdcDecoder = new Mdc1200.Decoder(8000);
    }

    const rv = mdcDecoder.processSamples(dataArray);

    if (rv === 1) {
        handleMdcPacket(mdcDecoder.getPacket());
    } else if (rv === 2) {
        handleMdcPacket(mdcDecoder.getDoublePacket());
    }
}

function handleAudioData(data, isMdc = false) {
    let dataArray = new Uint8Array(data);

    if (dataArray.length > 0) {
        if (isMdc) {
            processMdcData(dataArray);
        }

        // Apply input gain if enabled and configured
        if (audioGainConfig.enabled && audioGainConfig.inputGain !== 1.0) {
            const processedBuffer = applyInputGain(dataArray.buffer, audioGainConfig.inputGain);
            dataArray = new Uint8Array(processedBuffer);
        }

        pcmPlayer.feed(dataArray);

        if (isMdc)
            return;

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

    if (isPaging) {
        setTimeout(() => {
            playTones(source, analyser, context, fftSize);
        }, 3250);
    } else {
        playTones(source, analyser, context, fftSize);
    }
}

function playTones(source, analyser, ctx, fftSize) {
    source.start();
    ctx.startRendering().then(() => {
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

    if (frequency < 300 || frequency > 3000) {
        if (lastTone !== null) {
            const duration = now - toneStartTime;
            toneHistory.push({ freq: lastTone, duration });
            detectQC2Pair();
            lastTone = null;
            toneStartTime = null;
        }
        return;
    }

    if (lastTone === null) {
        toneStartTime = now;
        lastTone = frequency;
    } else if (Math.abs(frequency - lastTone) > FREQUENCY_TOLERANCE) {
        const duration = now - toneStartTime;
        toneHistory.push({ freq: lastTone, duration });
        detectQC2Pair();

        lastTone = frequency;
        toneStartTime = now;
    }
}

function detectQC2Pair() {
    if (toneHistory.length < 2) return;

    const recent = toneHistory.slice(-2);
    const [toneA, toneB] = recent;

    const durationA = toneA.duration;
    const durationB = toneB.duration;

    console.log(`checking pair: A=${toneA.freq} Hz (${durationA} ms), B=${toneB.freq} (${durationB} ms)`);

    if (durationA >= 5 && durationA <= 1200 && durationB >= 20 && durationB <= 3500) {
        if (currentCodeplug.qcList != null) {
            for (const pair of currentCodeplug.qcList) {
                const isMatchA = Math.abs(toneA.freq - pair.a) <= FREQ_MATCH_THRESHOLD;
                const isMatchB = Math.abs(toneB.freq - pair.b) <= FREQ_MATCH_THRESHOLD;

                if (isMatchA && isMatchB) {
                    console.log(`QC2 Match: A=${pair.a}, B=${pair.b}`);
                    minitorStandard();  // Start paging workflow
                    tonesQueue.push({ a: pair.a, b: pair.b });
                    break;
                }
            }
        }
        toneHistory = [];
    }
}

let volumeChangeTimeout = null;

function volumeUp() {
    if (volumeChangeTimeout) return;
    volumeChangeTimeout = setTimeout(() => { volumeChangeTimeout = null; }, 550);
    if (volumeLevel < 1.0) {
        volumeLevel += 0.1;
        volumeLevel = Math.min(1.0, volumeLevel);
        pcmPlayer.currentVolume = volumeLevel;
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
        pcmPlayer.currentVolume = volumeLevel;
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

function appendAudioBuffer(buffer) {
    for (let i = 0; i < buffer.length; i++)
        audioBuffer.push(buffer[i]);
}

function encodePcmBytes(buffer) {
    let binary = "";

    for (let i = 0; i < buffer.length; i++)
        binary += String.fromCharCode(buffer[i]);

    return btoa(binary);
}

function encodeMdcPttId() {
    const unitId = parseInt(myRid, 10) & 0xffff;
    const samples = Mdc1200.encodePacket(0x01, 0x00, unitId, {sampleRate: 8000, preamble: MDC_PREAMBLE_BYTES});
    const pcm = new Uint8Array((MDC_LEAD_SILENCE_SAMPLES + samples.length + MDC_TAIL_SILENCE_SAMPLES) * 2);
    let offset = MDC_LEAD_SILENCE_SAMPLES * 2;

    for (let i = 0; i < samples.length; i++) {
        pcm[offset++] = samples[i] & 0xff;
        pcm[offset++] = (samples[i] >> 8) & 0xff;
    }

    return pcm;
}

function sendConventionalPcm(buffer) {
    for (let i = 0; i < buffer.length; i += CONV_PCM_LENGTH) {
        let frame = buffer.slice(i, i + CONV_PCM_LENGTH);

        if (frame.length < CONV_PCM_LENGTH) {
            const padded = new Uint8Array(CONV_PCM_LENGTH);
            padded.set(frame);
            frame = padded;
        }

        SendConvVoice(encodePcmBytes(frame), myRid, currentTg, getCurrentMdcMode(), currentFrequncyChannel);
    }
}

function holdConventionalVoiceForMdc() {
    if (getCurrentMdcMode() === 0x01 && !mdcPttSent && typeof Mdc1200 !== 'undefined') {
        sendConventionalPcm(encodeMdcPttId());
        mdcPttSent = true;
        mdcVoiceHoldUntil = Date.now() + MDC_VOICE_DELAY_MS;
        return true;
    }

    return Date.now() < mdcVoiceHoldUntil;
}

function onAudioFrameReady(buffer, rms) {
    if (isTxing && currentFrequncyChannel !== null) {
        if (fringVC) {
            const degradedBuffer = simulateFringeCoverage(buffer, 8000);
            if (isCurrentConventional()) {
                if (holdConventionalVoiceForMdc()) return;

                sendConventionalPcm(degradedBuffer);
                return;
            }

            appendAudioBuffer(degradedBuffer);
        } else {
            if (isCurrentConventional()) {
                if (holdConventionalVoiceForMdc()) return;

                sendConventionalPcm(buffer);
                return;
            }

            appendAudioBuffer(buffer);
        }

        if (audioBuffer.length > MAX_BUFFER_SIZE) {
            console.warn("Audio buffer too large, dropping old frames");
            audioBuffer = audioBuffer.slice(audioBuffer.length - MAX_BUFFER_SIZE);
        }

        if (audioBuffer.length >= EXPECTED_PCM_LENGTH) {
            const fullFrame = audioBuffer.slice(0, EXPECTED_PCM_LENGTH);
            audioBuffer = audioBuffer.slice(EXPECTED_PCM_LENGTH);

            if (isCurrentConventional()) {
                const encoded = encodePcmBytes(fullFrame);
                SendConvVoice(encoded, myRid, currentTg, getCurrentMdcMode(), currentFrequncyChannel);
            } else {
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
}

function disconnectWebSocket() {
    if (socket) {
        const oldSocket = socket;
        socket = null;
        socketMode = null;
        pcmPlayer.clear();
        oldSocket.onopen = null;
        oldSocket.onclose = null;
        oldSocket.onerror = null;
        oldSocket.onmessage = null;
        oldSocket.close();
    }
}

function buttonBeep() {
    playSoundEffect('audio/buttonbeep.wav');
}

function minitorStandard() {
    if (isPaging) return; // Already paging
    isPaging = true;

    isAlertPlaying = true;
    playSoundEffect('audio/minitor_standard.wav', () => {
        isAlertPlaying = false;
        tryPlayNextTone();
    });
}

function tryPlayNextTone() {
    if (isTonePlaying || isAlertPlaying) return;

    const nextTone = tonesQueue.shift();
    if (!nextTone) {
        isPaging = false;
        return;
    }

    playToneSet(nextTone.a, nextTone.b, () => {
        tryPlayNextTone();
    });
}

function playToneSet(freqA, freqB, onComplete) {
    isTonePlaying = true;
    console.log(`Playing Tone A=${freqA}, B=${freqB}`);
    
    setTimeout(() => {
        isTonePlaying = false;
        onComplete?.();
    }, 4000);
}

function playSoundEffect(audioPath, onComplete) {
    const audio = new Audio(audioPath);
    audio.play().then(() => {
        audio.onended = () => {
            onComplete?.();
        };
    }).catch((err) => {
        console.error('Error playing sound:', err);
        onComplete?.(); 
    });
}


function knobClick() {
    playSoundEffect('audio/knob-click.wav');
}

function scanOn() {
    if (isCurrentConventional()) {
        displayError("Fail 01/84");
        return;
    }

    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];

    console.log(currentZone + " " + currentChannel)

    const currentScanList = scanManager.getScanListForChannel(currentZone.name, currentChannel.name);

    if (currentScanList == null){
        displayError("Fail 01/84");
        return;
    }

    scanManager.getChannelsInScanList(currentScanList.name).forEach(channel => {
        if (channel.tgid != null) {
            console.log("tgid " + channel.tgid)
            SendGroupAffiliationRequest(channel.tgid);
        }
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
