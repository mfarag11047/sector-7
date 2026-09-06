const fs = require('fs');
let content = fs.readFileSync('components/CityMap.tsx', 'utf-8');

const oldToggle = `      // Toggle Actions - Apply to all selected units of valid type
      setUnits(prev => prev.map(u => {
          if (!selectedUnitIds.has(u.id) && u.id !== unitId) return u;
          
          if (action === 'TOGGLE_JAMMER' && u.type === 'banshee') return { ...u, jammerActive: !u.jammerActive };
          if (action === 'TOGGLE DAMPENER' && u.type === 'ghost') return { ...u, isDampenerActive: !u.isDampenerActive };
          if (action === 'TOGGLE ARRAY' && u.type === 'sun_plate') return { ...u, isDeployed: !u.isDeployed };
          if (action === 'TOGGLE_ANCHOR' && u.type === 'swarm_host') {
              const anchoring = !u.isAnchored;
              if (anchoring) {
                  const newDrones = [
                      { id: \`crawler-\${u.id}-\${Date.now()}-1\`, type: 'crawler_drone', unitClass: 'ordnance', team: u.team, gridPos: {...u.gridPos}, path: [], visionRange: UNIT_STATS.crawler_drone.visionRange, health: UNIT_STATS.crawler_drone.maxHealth, maxHealth: UNIT_STATS.crawler_drone.maxHealth, battery: 100, maxBattery: 100, cooldowns: {}, parentId: u.id },
                      { id: \`crawler-\${u.id}-\${Date.now()}-2\`, type: 'crawler_drone', unitClass: 'ordnance', team: u.team, gridPos: {...u.gridPos}, path: [], visionRange: UNIT_STATS.crawler_drone.visionRange, health: UNIT_STATS.crawler_drone.maxHealth, maxHealth: UNIT_STATS.crawler_drone.maxHealth, battery: 100, maxBattery: 100, cooldowns: {}, parentId: u.id }
                  ];
                  setTimeout(() => {
                      setUnits(curr => [...curr, ...newDrones]);
                  }, 100);
              }
              return { 
                  ...u, 
                  isAnchored: anchoring, 
                  path: [],
                  cooldowns: { ...u.cooldowns, spawnWasp: anchoring ? 7000 : 0 } 
              };
          }
          if (action === 'SMOKE SCREEN' && u.type === 'tank') return { ...u, cooldowns: { ...u.cooldowns, titanSmoke: ABILITY_CONFIG.TITAN_SMOKE_COOLDOWN }, smoke: { active: true, remainingTime: ABILITY_CONFIG.TITAN_SMOKE_DURATION } };
          if (action === 'ACTIVATE APS' && u.type === 'tank') return { ...u, cooldowns: { ...u.cooldowns, titanAps: ABILITY_CONFIG.TITAN_APS_COOLDOWN }, aps: { active: true, remainingTime: ABILITY_CONFIG.TITAN_APS_DURATION } };
          return u;
      }));`;

const newToggle = `      // Toggle Actions - Apply to all selected units of valid type
      setUnits(prev => {
          let newDrones = [];
          const nextUnits = prev.map(u => {
              if (!selectedUnitIds.has(u.id) && u.id !== unitId) return u;
              
              if (action === 'TOGGLE_JAMMER' && u.type === 'banshee') return { ...u, jammerActive: !u.jammerActive };
              if (action === 'TOGGLE DAMPENER' && u.type === 'ghost') return { ...u, isDampenerActive: !u.isDampenerActive };
              if (action === 'TOGGLE ARRAY' && u.type === 'sun_plate') return { ...u, isDeployed: !u.isDeployed };
              if (action === 'TOGGLE_ANCHOR' && u.type === 'swarm_host') {
                  const anchoring = !u.isAnchored;
                  if (anchoring) {
                      const rId = Math.floor(Math.random() * 100000);
                      const idPrefix = \`crawler-\${u.id}-\${Date.now()}-\${rId}\`;
                      newDrones.push(
                          { id: \`\${idPrefix}-1\`, type: 'crawler_drone', unitClass: 'ordnance', team: u.team, gridPos: {...u.gridPos}, path: [], visionRange: UNIT_STATS.crawler_drone.visionRange, health: UNIT_STATS.crawler_drone.maxHealth, maxHealth: UNIT_STATS.crawler_drone.maxHealth, battery: 100, maxBattery: 100, cooldowns: {}, parentId: u.id },
                          { id: \`\${idPrefix}-2\`, type: 'crawler_drone', unitClass: 'ordnance', team: u.team, gridPos: {...u.gridPos}, path: [], visionRange: UNIT_STATS.crawler_drone.visionRange, health: UNIT_STATS.crawler_drone.maxHealth, maxHealth: UNIT_STATS.crawler_drone.maxHealth, battery: 100, maxBattery: 100, cooldowns: {}, parentId: u.id }
                      );
                  }
                  return { 
                      ...u, 
                      isAnchored: anchoring, 
                      path: [],
                      cooldowns: { ...u.cooldowns, spawnWasp: anchoring ? 7000 : 0 } 
                  };
              }
              if (action === 'SMOKE SCREEN' && u.type === 'tank') return { ...u, cooldowns: { ...u.cooldowns, titanSmoke: ABILITY_CONFIG.TITAN_SMOKE_COOLDOWN }, smoke: { active: true, remainingTime: ABILITY_CONFIG.TITAN_SMOKE_DURATION } };
              if (action === 'ACTIVATE APS' && u.type === 'tank') return { ...u, cooldowns: { ...u.cooldowns, titanAps: ABILITY_CONFIG.TITAN_APS_COOLDOWN }, aps: { active: true, remainingTime: ABILITY_CONFIG.TITAN_APS_DURATION } };
              return u;
          });
          return [...nextUnits, ...newDrones];
      });`;

if (content.includes(oldToggle)) {
    content = content.replace(oldToggle, newToggle);
    fs.writeFileSync('components/CityMap.tsx', content, 'utf-8');
    console.log("Successfully replaced block.");
} else {
    console.log("Failed to find block");
}
