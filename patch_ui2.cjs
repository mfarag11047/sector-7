const fs = require('fs');
let content = fs.readFileSync('components/UIOverlay.tsx', 'utf-8');
content = content.replace(
    'CRAWLERS: {minimapData.units.filter(u=>u.type===\'crawler_drone\').length}',
    'HOST CD: {minimapData.units.find(u=>u.type===\'swarm_host\')?.cooldowns?.spawnWasp} | CRAWLERS: {minimapData.units.filter(u=>u.type===\'crawler_drone\').length}'
);
fs.writeFileSync('components/UIOverlay.tsx', content, 'utf-8');
