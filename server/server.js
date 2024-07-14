const { Server } = require('@citizenfx/server');
const fs = require('fs');
const yaml = require('js-yaml');

let codeplugs = {};

displayStartupMessage();
loadCodeplugs();

on('playerConnecting', (name, setKickReason, deferrals) => {
    // console.debug(`${name} is connecting to the server.`);
});

on('playerDropped', (reason) => {
    // console.debug(`A player has left the server: ${reason}`);
});

function loadCodeplugs() {
    try {
        const codeplugDir = GetResourcePath(GetCurrentResourceName()) + '/codeplugs/';
        fs.readdirSync(codeplugDir).forEach(file => {
            if (file.endsWith('.yml')) {
                const codeplugName = file.slice(0, -4);
                const fileContents = fs.readFileSync(codeplugDir + file, 'utf8');
                codeplugs[codeplugName] = yaml.load(fileContents);
            }
        });
        // console.debug('Codeplugs loaded:', Object.keys(codeplugs));
    } catch (e) {
        console.error('Error loading codeplugs:', e);
    }
}

RegisterCommand('set_codeplug', (source, args, rawCommand) => {
    const codeplugName = args[0];
    if (codeplugs[codeplugName]) {
        // console.debug(`Setting codeplug for player ${source}: ${codeplugName}`);
        emitNet('receiveCodeplug', source, codeplugs[codeplugName]);
    } else {
        console.debug(`Codeplug not found: ${codeplugName}`);
    }
});

function displayStartupMessage() {
    console.log('============================================================');
    console.log('==                                                        ==');
    console.log('==                   WhackerLinkFiveM                     ==');
    console.log('==             Author: Caleb, KO4UYJ (_php_)              ==');
    console.log('==             GitHub: https://github.com/WhackerLink     ==');
    console.log('==                                                        ==');
    console.log('============================================================');
}