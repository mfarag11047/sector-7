const ABILITY_CONFIG = { SWARM_HOST_MAX_UNITS: 10 };
let prevUnits = [
    { id: 'host-1', type: 'swarm_host', team: 'blue', gridPos: {x:5, z:5}, cooldowns: { spawnWasp: 0 }, isAnchored: true }
];

let unitsChanged = false;
let nextUnits = [...prevUnits];

const hosts = nextUnits.filter(u => u.type === 'swarm_host');
const hostMap = new Map();
hosts.forEach(host => {
    hostMap.set(host.id, host);
    if (host.isAnchored) {
        const children = nextUnits.filter(u => u.type === 'crawler_drone' && u.parentId === host.id);
        const maxCrawlers = ABILITY_CONFIG.SWARM_HOST_MAX_UNITS || 10;
        const spawnReady = !host.cooldowns.spawnWasp || host.cooldowns.spawnWasp <= 0;

        if (children.length < maxCrawlers && spawnReady) {
            const newCrawler = {
                id: `crawler-1`, type: 'crawler_drone', parentId: host.id, cooldowns: {}
            };
            nextUnits.push(newCrawler);
            const hIdx = nextUnits.findIndex(u => u.id === host.id);
            if (hIdx !== -1) {
                nextUnits[hIdx] = {
                    ...nextUnits[hIdx],
                    cooldowns: { ...nextUnits[hIdx].cooldowns, spawnWasp: 7000 }
                };
            }
            unitsChanged = true;
        }
    }
});

const survivingUnits = [];
nextUnits.forEach(u => {
    let modifiedUnit = u;
    let keepUnit = true;
    let uChanged = false;
    if (modifiedUnit.cooldowns) {
        const nextCds = { ...modifiedUnit.cooldowns };
        let cdsChanged = false;
        for (const k in nextCds) {
            if (typeof nextCds[k] === 'number' && nextCds[k] > 0) {
                nextCds[k] = Math.max(0, nextCds[k] - 1000);
                cdsChanged = true;
            }
        }
        if (cdsChanged) {
            modifiedUnit = { ...modifiedUnit, cooldowns: nextCds };
            uChanged = true;
        }
    }
    if (uChanged) unitsChanged = true;
    if (keepUnit) survivingUnits.push(modifiedUnit);
});

console.log('Resulting units length:', survivingUnits.length);
console.log('Host cooldown:', survivingUnits[0].cooldowns.spawnWasp);
if (survivingUnits.length > 1) {
    console.log('Crawler type:', survivingUnits[1].type);
}
