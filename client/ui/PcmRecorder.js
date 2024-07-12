/*
    * From github
 */

function MicCapture() {
    var source = null;
    var node = null;
    var gainNode = null;
    var stream = null;
    var gain = 1;
    var callbackOnComplete = null;

    this.captureMicrophone = function(cb) {
        var constraints = {
            audio: {
                sampleRate: 48000,
                channelCount: 1,
                volume: 1.0,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            },
            video: false
        };
        callbackOnComplete = cb;
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia(constraints).then(successCallback).catch(failureCallback);
        } else {
            alert('Microphone access denied (navigator.mediaDevices not supported). If you are on Chrome for iOS, try Safari');
        }
    };

    this.stopCapture = function() {
        if (source != null) {
            source.disconnect();
            source = null;
        }
        if (gainNode != null) {
            gainNode.disconnect();
            gainNode = null;
        }
        if (node != null) {
            node.disconnect();
            node = null;
        }
        if (stream != null) {
            stream.getTracks()[0].stop();
            stream = null;
        }
    };

    function setSampleRate(mediaStream) {
        let track = mediaStream.getTracks()[0];
        let constraints = track.getConstraints();
        constraints.sampleRate = 8000;
        track.applyConstraints(constraints).catch(err => {
            console.error('Failed to set sample rate:', err.message);
        });
    }

    function failureCallback(err) {
        alert('Failed to capture microphone. ' + err.message);
    }

    function successCallback(mediaStream) {
        var audioContext = new (window.AudioContext || window.webkitAudioContext)();
        stream = mediaStream;
        setSampleRate(mediaStream);

        source = audioContext.createMediaStreamSource(mediaStream);
        gainNode = audioContext.createGain();
        gainNode.gain.value = gain;
        node = audioContext.createScriptProcessor(0, 1, 1);

        const samplesPerFrame = 160;
        var totalSamples = 0;
        var outputSamples = 0;
        var sample = 0;
        var frame = new ArrayBuffer(samplesPerFrame * 2);
        var view = new DataView(frame);
        var sum = 0.0;

        function downsampleBuffer(buffer, sampleRate, rate) {
            if (rate == sampleRate) {
                return buffer;
            }
            if (rate > sampleRate) {
                throw 'rate should be less than sampleRate';
            }
            var sampleRateRatio = sampleRate / rate;
            var newLength = Math.round(buffer.length / sampleRateRatio);
            var result = new Float32Array(newLength);
            var offsetResult = 0;
            var offsetBuffer = 0;
            while (offsetResult < result.length) {
                var nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
                var accum = 0;
                var count = 0;
                for (var i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
                    accum += buffer[i];
                    count++;
                }
                result[offsetResult] = accum / count;
                offsetResult++;
                offsetBuffer = nextOffsetBuffer;
            }
            return result;
        }

        node.onaudioprocess = function(data) {
            try {
                var inBuffer = data.inputBuffer.getChannelData(0);
                var downsampled = downsampleBuffer(inBuffer, data.inputBuffer.sampleRate, 8000);
                for (var i = 0; i < downsampled.length; i++) {
                    var downSample = downsampled[i];
                    var sample16 = downSample < 0 ? downSample * 0x8000 : downSample * 0x7fff;
                    view.setInt16(outputSamples * 2, sample16, true);
                    outputSamples++;
                    sum += (sample16 * sample16);
                    if (outputSamples >= samplesPerFrame) {
                        outputSamples = 0;
                        var rms = Math.sqrt(sum / samplesPerFrame) / 32767.0;
                        sum = 0.0;
                        onAudioFrameReady(new Uint8Array(frame), rms * 30.0);
                    }
                }
            } catch (error) {
                console.error('Error processing audio:', error);
            }
        };

        source.connect(gainNode);
        gainNode.connect(node);
        node.connect(audioContext.destination);
        callbackOnComplete();
    }
}

var micCapture = new MicCapture();