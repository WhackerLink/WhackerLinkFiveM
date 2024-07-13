const { Server } = require('@citizenfx/server');
const fs = require('fs');
const yaml = require('js-yaml');
let config;

displayStartupMessage();
// loadConfig();

on('playerConnecting', (name, setKickReason, deferrals) => {
    // console.debug(`${name} is connecting to the server.`);
});

on('playerDropped', (reason) => {
    // console.debug(`A player has left the server: ${reason}`);
});

/*
function loadConfig() {
    try {
        const fileContents = fs.readFileSync('config.yml', 'utf8');
        config = yaml.load(fileContents);
        console.debug('Config loaded:', config);
    } catch (e) {
        console.error('Error loading config:', e);
    }
}
*/

/*on('playerSpawned', (source) => {
    emitNet('receiveConfig', source, config);
});*/

function displayStartupMessage() {
    console.log('============================================================');
    console.log('==                                                        ==');
    console.log('==                   WhackerLinkFiveM                     ==');
    console.log('==             Author: Caleb, KO4UYJ (_php_)              ==');
    console.log('==             GitHub: https://github.com/WhackerLink     ==');
    console.log('==                                                        ==');
    console.log('============================================================');
}