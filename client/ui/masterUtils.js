function SendRegistrationRequest() {
    if (!socketOpen) { return; }

    const request = {
        type: packetToNumber("U_REG_REQ"),
        data: {
            SrcId: myRid,
            Site: currentSite
        }
    }

    socket.send(JSON.stringify(request));
}

function SendDeRegistrationRequest() {
    if (!socketOpen) { return; }

    const request = {
        type: packetToNumber("U_DE_REG_REQ"),
        data: {
            SrcId: myRid,
            Site: currentSite
        }
    }

    socket.send(JSON.stringify(request));
}

function SendGroupAffiliationRequest() {
    if (!socketOpen) { return; }

    const request = {
        type: packetToNumber("GRP_AFF_REQ"),
        data: {
            SrcId: myRid,
            DstId: currentTg,
            Site: currentSite
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
            DstId: currentTg,
            Site: currentSite
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
            Channel: currentFrequncyChannel,
            Site: currentSite
        }
    }

    socket.send(JSON.stringify(request));
}

function SendEmergencyAlarmRequest() {
    if (!socketOpen) { return; }

    const request = {
        type: packetToNumber("EMRG_ALRM_REQ"),
        data: {
            SrcId: myRid,
            DstId: currentTg,
            Site: currentSite
        }
    }

    socket.send(JSON.stringify(request));
}