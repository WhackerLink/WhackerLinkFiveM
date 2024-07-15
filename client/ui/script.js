const pcmPlayer = new PCMPlayer({encoding: '16bitInt', channels: 1, sampleRate: 8000});
const EXPECTED_PCM_LENGTH = 1600;
const CHUNK_SIZE = 320;

const beepAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

let socket;
let currentChannelIndex = 0;
let currentZoneIndex = 0;
let currentFrequncyChannel;
let currentCodeplug;
let isInRange = false;
let isTxing = false;
let audioBuffer = [];

let myRid = "1234";
let currentTg = "2001";
let radioModel;

function socketOpen() {
    return socket && socket.readyState === WebSocket.OPEN;
}

window.addEventListener('message', async function (event) {
    if (event.data.type === 'openRadio') {
        currentCodeplug = event.data.codeplug;

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

        micCapture.captureMicrophone(() => {
            console.log('Microphone captured');
        });

        loadRadioModelAssets(radioModel);
        document.getElementById('radio-container').style.display = 'block';
        connectWebSocket();
        updateDisplay();
    } else if (event.data.type === 'closeRadio') {
        micCapture.stopCapture();
        console.debug('Recording stopped');
        await SendDeRegistrationRequest();
        document.getElementById('radio-container').style.display = 'none';
        disconnectWebSocket();
    } else if (event.data.type === "pttPress") {
        SendGroupVoiceRequest();
    } else if (event.data.type === "pttRelease") {

        if (isTxing) {
            SendGroupVoiceRelease();
            currentFrequncyChannel = null;
            /*            micCapture.stopCapture();
                        console.debug('Recording stopped');*/
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
        loadRadioModelAssets(event.data.model);
        radioModel = event.data.model;
    }
});

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

function changeChannel(direction) {
    currentChannelIndex += direction;
    const currentZone = currentCodeplug.zones[currentZoneIndex];
    if (currentChannelIndex >= currentZone.channels.length) {
        currentChannelIndex = 0;
    } else if (currentChannelIndex < 0) {
        currentChannelIndex = currentZone.channels.length - 1;
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
    }
}

function connectWebSocket() {
    //console.log(JSON.stringify(currentCodeplug));
    const currentZone = currentCodeplug.zones[currentZoneIndex];
    const currentChannel = currentZone.channels[currentChannelIndex];
    const currentSystem = currentCodeplug.systems.find(system => system.name === currentChannel.system);

    console.debug("Connecting to master...");
    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log("Already connected?")
        return;
    }

    socket = new WebSocket(`ws://${currentSystem.address}:${currentSystem.port}/client`);
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
        isInRange = true;
        setUiOOR(isInRange);
        console.debug('WebSocket connection established');
        // console.debug("Codeplug: " + currentCodeplug);
        SendRegistrationRequest();
    };

    socket.onclose = () => {
        isInRange = false;
        setUiOOR(isInRange);
        console.debug('WebSocket connection closed');
    }

    socket.onerror = (error) => {
        isInRange = false;
        setUiOOR(isInRange);
        console.error('WebSocket error:', error);
    }

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (typeof event.data === 'string') {
            console.debug(`Received master message: ${event.data}`);

            if (data.type == packetToNumber("AUDIO_DATA")) {
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
                    currentFrequncyChannel = data.data.Channel;
                    isTxing = false;
                    document.getElementById("line3").style.color = "black";
                    document.getElementById("line3").innerHTML = `ID: ${data.data.SrcId}`;
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rx.png`;
                } else if (data.data.SrcId === myRid && data.data.DstId === currentTg && data.data.Status === 0) {
                    currentFrequncyChannel = data.data.Channel;
                    isTxing = true;
                    tpt_generate();
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/tx.png`;
                    /*                    micCapture.captureMicrophone(() => {
                                            console.log('Microphone captured');
                                        });*/
                } else if (data.data.SrcId === myRid && data.data.DstId === currentTg && data.data.Status !== 0) {
                    bonk();
                }
            } else if (data.type == packetToNumber("GRP_VCH_RLS")) {
                if (data.data.SrcId !== myRid && data.data.DstId === currentTg) {
                    document.getElementById("line3").innerHTML = '';
                    currentFrequncyChannel = null;
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi4bar.png`;
                } else if (data.data.SrcId === myRid && data.data.DstId === currentTg) {
                    document.getElementById("rssi-icon").src = `models/${radioModel}/icons/rssi4bar.png`;
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
        audioBuffer.push(...buffer);

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

function buttonBonk() {
    playSoundEffect('buttonbonk.wav');
}


function playSoundEffect(audioPath) {
    var audio = new Audio(audioPath);
    audio.play();
}

function loadRadioModelAssets(model) {
    const radioImage = document.getElementById('radio-image');
    const rssiIcon = document.getElementById('rssi-icon');
    const radioStylesheet = document.getElementById('radio-stylesheet');
    radioImage.src = `models/${model}/radio.png`;
    radioStylesheet.href = `models/${model}/style.css`;
    rssiIcon.src = `models/${model}/icons/rssi4bar.png`;
}
