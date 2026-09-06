const fs = require('fs');
let content = fs.readFileSync('components/CityMap.tsx', 'utf-8');

// 1. Add getSpawnPos inside the interval
const oldInterval = `              let nextUnits = [...prevUnits];

              // 1. Swarm Host Spawning Logic`;
const newInterval = `              let nextUnits = [...prevUnits];

              const getSpawnPos = (center) => {
                  const neighbors = [
                      {x: center.x+1, z: center.z}, {x: center.x-1, z: center.z}, 
                      {x: center.x, z: center.z+1}, {x: center.x, z: center.z-1},
                      {x: center.x+1, z: center.z+1}, {x: center.x-1, z: center.z-1},
                      {x: center.x+1, z: center.z-1}, {x: center.x-1, z: center.z+1}
                  ];
                  for (let n of neighbors) {
                      if (n.x >= 0 && n.x < CITY_CONFIG.gridSize && n.z >= 0 && n.z < CITY_CONFIG.gridSize) {
                          if (dynamicRoadTileSet.has((n.x << 16) | n.z)) return n;
                      }
                  }
                  return { ...center };
              };

              // 1. Swarm Host Spawning Logic`;
content = content.replace(oldInterval, newInterval);

// Replace gridPos for periodic spawn
const oldPeriodicSpawn = `                              gridPos: { ...host.gridPos }, // Spawn at host location`;
const newPeriodicSpawn = `                              gridPos: getSpawnPos(host.gridPos), // Spawn at valid adjacent location`;
content = content.replace(oldPeriodicSpawn, newPeriodicSpawn);

// 2. Patrol logic retry loop
const oldPatrol = `                                  } else {
                                      // Patrol near parent
                                      const rx = parent.gridPos.x + Math.floor(Math.random() * 10 - 5);
                                      const rz = parent.gridPos.z + Math.floor(Math.random() * 10 - 5);
                                      const d = Math.sqrt(Math.pow(rx - parent.gridPos.x, 2) + Math.pow(rz - parent.gridPos.z, 2));
                                      if (d <= range && rx >= 0 && rx < CITY_CONFIG.gridSize && rz >= 0 && rz < CITY_CONFIG.gridSize) {
                                          if (dynamicRoadTileSet.has((rx << 16) | rz)) {
                                              targetPos = { x: rx, z: rz };
                                          }
                                      }
                                  }`;
const newPatrol = `                                  } else {
                                      // Patrol near parent
                                      for (let i = 0; i < 15; i++) {
                                          const rx = parent.gridPos.x + Math.floor(Math.random() * 10 - 5);
                                          const rz = parent.gridPos.z + Math.floor(Math.random() * 10 - 5);
                                          const d = Math.sqrt(Math.pow(rx - parent.gridPos.x, 2) + Math.pow(rz - parent.gridPos.z, 2));
                                          if (d <= range && rx >= 0 && rx < CITY_CONFIG.gridSize && rz >= 0 && rz < CITY_CONFIG.gridSize) {
                                              if (dynamicRoadTileSet.has((rx << 16) | rz)) {
                                                  targetPos = { x: rx, z: rz };
                                                  break;
                                              }
                                          }
                                      }
                                  }`;
content = content.replace(oldPatrol, newPatrol);

// 3. Add getSpawnPos inside handleUnitAction
const oldToggle = `      // Toggle Actions - Apply to all selected units of valid type
      setUnits(prev => {
          let newDrones = [];`;
const newToggle = `      // Toggle Actions - Apply to all selected units of valid type
      setUnits(prev => {
          let newDrones: any[] = [];
          const getSpawnPos = (center: {x: number, z: number}) => {
              const neighbors = [
                  {x: center.x+1, z: center.z}, {x: center.x-1, z: center.z}, 
                  {x: center.x, z: center.z+1}, {x: center.x, z: center.z-1},
                  {x: center.x+1, z: center.z+1}, {x: center.x-1, z: center.z-1},
                  {x: center.x+1, z: center.z-1}, {x: center.x-1, z: center.z+1}
              ];
              for (let n of neighbors) {
                  if (n.x >= 0 && n.x < CITY_CONFIG.gridSize && n.z >= 0 && n.z < CITY_CONFIG.gridSize) {
                      if (dynamicRoadTileSet.has((n.x << 16) | n.z)) return n;
                  }
              }
              return { ...center };
          };`;
content = content.replace(oldToggle, newToggle);

// Replace gridPos for initial spawn
const oldInitialDrones = `                      newDrones.push(
                          { id: \`\${idPrefix}-1\`, type: 'crawler_drone', unitClass: 'ordnance', team: u.team, gridPos: {...u.gridPos}, path: [], visionRange: UNIT_STATS.crawler_drone.visionRange, health: UNIT_STATS.crawler_drone.maxHealth, maxHealth: UNIT_STATS.crawler_drone.maxHealth, battery: 100, maxBattery: 100, cooldowns: {}, parentId: u.id },
                          { id: \`\${idPrefix}-2\`, type: 'crawler_drone', unitClass: 'ordnance', team: u.team, gridPos: {...u.gridPos}, path: [], visionRange: UNIT_STATS.crawler_drone.visionRange, health: UNIT_STATS.crawler_drone.maxHealth, maxHealth: UNIT_STATS.crawler_drone.maxHealth, battery: 100, maxBattery: 100, cooldowns: {}, parentId: u.id }
                      );`;
const newInitialDrones = `                      newDrones.push(
                          { id: \`\${idPrefix}-1\`, type: 'crawler_drone', unitClass: 'ordnance', team: u.team, gridPos: getSpawnPos(u.gridPos), path: [], visionRange: UNIT_STATS.crawler_drone.visionRange, health: UNIT_STATS.crawler_drone.maxHealth, maxHealth: UNIT_STATS.crawler_drone.maxHealth, battery: 100, maxBattery: 100, cooldowns: {}, parentId: u.id },
                          { id: \`\${idPrefix}-2\`, type: 'crawler_drone', unitClass: 'ordnance', team: u.team, gridPos: getSpawnPos(u.gridPos), path: [], visionRange: UNIT_STATS.crawler_drone.visionRange, health: UNIT_STATS.crawler_drone.maxHealth, maxHealth: UNIT_STATS.crawler_drone.maxHealth, battery: 100, maxBattery: 100, cooldowns: {}, parentId: u.id }
                      );`;
content = content.replace(oldInitialDrones, newInitialDrones);

fs.writeFileSync('components/CityMap.tsx', content, 'utf-8');
console.log("Patched spawn logic");
