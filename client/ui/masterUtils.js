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