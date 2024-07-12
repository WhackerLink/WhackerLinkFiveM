const pcmPlayer = new PCMPlayer({ encoding: '16bitInt', channels: 1, sampleRate: 8000 });
const EXPECTED_PCM_LENGTH = 1600;
const CHUNK_SIZE = 320;

const beepAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

let socket;
let currentChannel;
let audioBuffer = [];

let myRid = "1234";
let currentTg = "2001";

window.addEventListener('message', async function (event) {
    if (event.data.type === 'openRadio') {
        document.getElementById('radio-container').style.display = 'block';
        connectWebSocket();
    } else if (event.data.type === 'closeRadio') {
        await SendDeRegistrationRequest();
        document.getElementById('radio-container').style.display = 'none';
        disconnectWebSocket();
    } else if (event.data.type === "pttPress") {
        SendGroupVoiceRequest();
    } else if (event.data.type === "pttRelease") {
        micCapture.stopCapture();
        console.log('Recording stopped');
        SendGroupVoiceRelease();
        currentChannel = null;
    } else if (event.data.type === 'showStartupMessage') {
        document.getElementById('startup-message').style.display = 'block';
    } else if (event.data.type === 'hideStartupMessage') {
        document.getElementById('startup-message').style.display = 'none';
    } else if (event.data.type === 'setRid') {
        myRid = event.data.rid;
    }
});

function socketOpen(){
    return socket && socket.readyState === WebSocket.OPEN;
}

function SendRegistrationRequest() {
    if (!socketOpen) { return; }

    const request = {
        type: packetToNumber("U_REG_REQ"),
        data: {
            SrcId: myRid
        }
    }

    socket.send(JSON.stringify(request));
}

function SendDeRegistrationRequest() {
    if (!socketOpen) { return; }

    const request = {
        type: packetToNumber("U_DE_REG_REQ"),
        data: {
            SrcId: myRid
        }
    }

    socket.send(JSON.stringify(request));
}

function SendGroupVoiceRequest() {
    if (!socketOpen) { return; }

    const request = {
        type: packetToNumber("GRP_VCH_REQ"),
        data: {
            SrcId: myRid,
            DstId: currentTg
        }
    }

    socket.send(JSON.stringify(request));
}

function SendGroupVoiceRelease() {
    if (!socketOpen) { return; }

    const request = {
        type: packetToNumber("GRP_VCH_RLS"),
        data: {
            SrcId: myRid,
            DstId: currentTg,
            Channel: currentChannel
        }
    }

    socket.send(JSON.stringify(request));
}

function connectWebSocket() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        return;
    }

    socket = new WebSocket('ws://fne.zone1.scan.stream:3015/client');
    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
        console.debug('WebSocket connection established');
        SendRegistrationRequest();
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (typeof event.data === 'string') {
            console.debug(`Received master message: ${event.data}`);

            if (data.type == packetToNumber("AUDIO_DATA")) {
                if (data.voiceChannel.SrcId !== myRid && data.voiceChannel.DstId == currentTg && data.voiceChannel.Frequency == currentChannel) {
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
                    currentChannel = data.data.Channel;
                    document.getElementById("line3").innerHTML = `ID: ${data.data.SrcId}`;
                } else if (data.data.SrcId === myRid && data.data.DstId === currentTg && data.data.Status === 0) {
                    currentChannel = data.data.Channel;
                    tpt_generate();
                    micCapture.captureMicrophone(() => {
                        console.log('Microphone captured');
                    });
                } else if (data.data.SrcId === myRid && data.data.DstId === currentTg && data.data.Status !== 0) {
                    bonk();
                }
            } else if (data.type == packetToNumber("GRP_VCH_RLS")) {
                if (data.data.SrcId !== myRid && data.data.DstId === currentTg) {
                    document.getElementById("line3").innerHTML = '';
                    currentChannel = null;
                } else if (data.data.SrcId === myRid && data.data.DstId === currentTg) {

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
function tpt_generate(){
    beep(910, 30, 20, 'sine');
    setTimeout(function () {
        beep(0, 20, 20, 'sine');
    }, 30);
    setTimeout(function () {
        beep(910, 30, 20, 'sine');
    }, 50);
    setTimeout(function () {
        beep(0, 20, 20, 'sine');
    }, 80);
    setTimeout(function () {
        beep(910, 50, 20, 'sine');
    }, 100);
}

function play_page_alert(){
    beep(910, 150, 20, 'sine');
    setTimeout(function () {
        beep(0, 150, 20, 'sine');
    }, 150);
    setTimeout(()=>{
        beep(910, 150, 20, 'sine');
    }, 300);
    setTimeout(()=>{
        beep(0, 150, 20, 'sine');
    }, 450);
    setTimeout(()=>{
        beep(910, 150, 20, 'sine');
    }, 600);
    setTimeout(()=>{
        beep(0, 150, 20, 'sine');
    }, 750);
    setTimeout(()=>{
        beep(910, 150, 20, 'sine');
    }, 900);
}

function emergency_tone_generate(){
    beep(610, 500, 20, 'sine');
    setTimeout(function () {
        beep(910, 500, 20, 'sine');
    }, 500);
    setTimeout(function () {
        beep(610, 500, 20, 'sine');
    }, 1000);
    setTimeout(function () {
        beep(910, 500, 20, 'sine');
    }, 1500);
}
function bonk(){
    beep(310, 1000, 5, 'sine');
}

function onAudioFrameReady(buffer, rms) {
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
                Frequency: currentChannel
            },
            data: fullFrame
        };

        const jsonString = JSON.stringify(response);
        socket.send(jsonString);
    }
}

function disconnectWebSocket() {
    if (socket) {
        socket.close();
        socket = null;
    }
}