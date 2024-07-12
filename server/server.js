const { Server } = require('@citizenfx/server');

displayStartupMessage();

on('playerConnecting', (name, setKickReason, deferrals) => {
    console.debug(`${name} is connecting to the server.`);
});

on('playerDropped', (reason) => {
    console.debug(`A player has left the server: ${reason}`);
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