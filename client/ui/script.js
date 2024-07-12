const pcmPlayer = new PCMPlayer({ encoding: '16bitInt', channels: 1, sampleRate: 8000 });
const EXPECTED_PCM_LENGTH = 1600;
const CHUNK_SIZE = 320;

let socket;
let currentChannel;
let audioBuffer = [];

let myRid = "123498";
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
    console.debug("Sending u de reg")
    if (!socketOpen) { return; }

    const request = {
        type: packetToNumber("U_DE_REG_REQ"),
        data: {
            SrcId: myRid
        }
    }

    socket.send(JSON.stringify(request));

    console.debug("sent u de reg")

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
                if (data.data.SrcId !== myRid && data.data.DstId === currentTg) {
                    currentChannel = data.data.Channel;
                    document.getElementById("line3").innerHTML = `ID: ${data.data.SrcId}`;
                } else if (data.data.SrcId === myRid && data.data.DstId === currentTg) {
                    currentChannel = data.data.Channel;
                    micCapture.captureMicrophone(() => {
                        console.log('Microphone captured');
                    });
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

function onAudioFrameReady(buffer, rms) {
    console.log('Received audio chunk:', buffer);

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

        console.log('Sent audio frame:', fullFrame);
    }
}

function disconnectWebSocket() {
    if (socket) {
        socket.close();
        socket = null;
    }
}