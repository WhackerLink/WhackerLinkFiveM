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
            Lat: currentLat,
            Long: currentLng,
            Site: currentSite
        }
    }
    
    socket.send(JSON.stringify(request));
}

function SendAckResponse(service) {
    if (!socketOpen) { return; }

    const request = {
        type: packetToNumber("ACK_RSP"),
        data: {
            Service: service,
            SrcId: myRid,
            DstId: currentTg
        }
    }

    socket.send(JSON.stringify(request));
}

function SendLocBcast() {
    if (!socketOpen) { return; }

    const request = {
        type: packetToNumber("LOC_BCAST"),
        data: {
            SrcId: myRid,
            Lat: currentLat,
            Long: currentLng,
            Site: currentSite
        }
    }

    socket.send(JSON.stringify(request));
}

function SendStsBcast(site, status) {
    if (!socketOpen) { return; }

    const request = {
        type: packetToNumber("STS_BCAST"),
        data: {
            Site: site,
            Status: status
        }
    }

    socket.send(JSON.stringify(request));
}