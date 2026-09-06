const fs = require('fs');
let content = fs.readFileSync('components/CityMap.tsx', 'utf-8');

const oldDrain = `                      // General Battery Drain
                      if (u.battery > 0 && u.type !== 'defense_drone') { 
                          newUnit.battery = Math.max(0, newUnit.battery - drain); 
                          if (newUnit.battery !== u.battery) uChanged = true; 
                      }`;
const newDrain = `                      // General Battery Drain
                      if (u.battery > 0 && u.type !== 'defense_drone') { 
                          let shouldDrain = true;
                          if (u.type === 'crawler_drone' && u.parentId) {
                              const parent = currentUnitsRef.find(p => p.id === u.parentId);
                              if (parent && parent.isAnchored) {
                                  const dist = Math.sqrt((u.gridPos.x - parent.gridPos.x)**2 + (u.gridPos.z - parent.gridPos.z)**2);
                                  if (dist <= (ABILITY_CONFIG.CRAWLER_RADIUS || 7)) {
                                      shouldDrain = false;
                                      newUnit.battery = u.maxBattery;
                                      if (newUnit.battery !== u.battery) uChanged = true;
                                  }
                              }
                          }
                          if (shouldDrain) {
                              newUnit.battery = Math.max(0, newUnit.battery - drain); 
                              if (newUnit.battery !== u.battery) uChanged = true; 
                          }
                      }`;

if (content.includes(oldDrain)) {
    content = content.replace(oldDrain, newDrain);
    fs.writeFileSync('components/CityMap.tsx', content, 'utf-8');
    console.log("Patched battery drain");
} else {
    console.log("Failed to find battery drain block");
}
