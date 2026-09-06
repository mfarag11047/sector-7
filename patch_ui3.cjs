const fs = require('fs');
let content = fs.readFileSync('components/UIOverlay.tsx', 'utf-8');
content = content.replace(
    'HOST CD: {minimapData.units.find(u=>u.type===\'swarm_host\')?.cooldowns?.spawnWasp}',
    'ANCHORED: {minimapData.units.find(u=>u.type===\'swarm_host\')?.isAnchored ? "Y" : "N"} | CD: {minimapData.units.find(u=>u.type===\'swarm_host\')?.cooldowns?.spawnWasp}'
);
fs.writeFileSync('components/UIOverlay.tsx', content, 'utf-8');
