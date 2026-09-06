const fs = require('fs');

let content = fs.readFileSync('components/CityMap.tsx', 'utf-8');

content = content.replace(
`                       // Nuke Damage Event
                       if (isNuke) {
                           damageEvents.push({ id: \`nuke-dmg-\${now}\`, damage: 500, position: p.targetPos, radius: 8 * tileSize, team: p.team as UnitData['team'] });
                       }`,
`                       // Damage Events
                       const cloudType = p.payload || 'he';
                       if (isNuke) {
                           damageEvents.push({ id: \`nuke-dmg-\${now}\`, damage: 500, position: p.targetPos, radius: 8 * tileSize, team: p.team as UnitData['team'] });
                       } else if (cloudType === 'he') {
                           damageEvents.push({ id: \`he-dmg-\${now}\`, damage: 150, position: p.targetPos, radius: 4 * tileSize, team: p.team as UnitData['team'] });
                       }`
);

content = content.replace(
`                       // Create Cloud (if applicable)
                       const cloudType = p.payload || 'he';
                       if (cloudType !== 'nuke' && cloudType !== 'titan_drop') {
                           if (cloudType === 'nano_cloud_master') {`,
`                       // Create Cloud (if applicable)
                       if (cloudType !== 'nuke' && cloudType !== 'titan_drop' && cloudType !== 'he') {
                           if (cloudType === 'nano_cloud_master') {`
);

content = content.replace(
`                           } else if (cloudType === 'eclipse' || cloudType === 'he') {
                               setClouds(prev => [...prev, {
                                   id: \`cloud-\${Date.now()}-\${Math.random()}\`,
                                   type: cloudType as 'eclipse'|'he',
                                   gridPos: { x: Math.round((p.targetPos!.x + offset) / CITY_CONFIG.tileSize), z: Math.round((p.targetPos!.z + offset) / CITY_CONFIG.tileSize) },
                                   radius: cloudType === 'eclipse' ? ABILITY_CONFIG.ECLIPSE_RADIUS : ABILITY_CONFIG.HE_RADIUS,
                                   duration: cloudType === 'eclipse' ? ABILITY_CONFIG.ECLIPSE_DURATION : ABILITY_CONFIG.HE_DURATION,
                                   createdAt: Date.now(),
                                   team: p.team as CloudData['team']
                               }]);
                           }`,
`                           } else if (cloudType === 'eclipse') {
                               setClouds(prev => [...prev, {
                                   id: \`cloud-\${Date.now()}-\${Math.random()}\`,
                                   type: 'eclipse',
                                   gridPos: { x: Math.round((p.targetPos!.x + offset) / CITY_CONFIG.tileSize), z: Math.round((p.targetPos!.z + offset) / CITY_CONFIG.tileSize) },
                                   radius: ABILITY_CONFIG.ECLIPSE_RADIUS,
                                   duration: ABILITY_CONFIG.ECLIPSE_DURATION,
                                   createdAt: Date.now(),
                                   team: p.team as CloudData['team']
                               }]);
                           }`
);

fs.writeFileSync('components/CityMap.tsx', content, 'utf-8');
