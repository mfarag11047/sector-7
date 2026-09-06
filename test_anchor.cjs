const fs = require('fs');
let content = fs.readFileSync('components/CityMap.tsx', 'utf-8');

const oldAnchor = `              } else {
                  // Destory all children
                  setTimeout(() => {
                      setUnits(curr => curr.filter(currU => currU.parentId !== u.id));
                  }, 100);
              }
              return { 
                  ...u, 
                  isAnchored: anchoring, 
                  path: [],
                  cooldowns: { ...u.cooldowns, spawnWasp: anchoring ? 7000 : 0 } 
              };`;

const newAnchor = `              }
              return { 
                  ...u, 
                  isAnchored: anchoring, 
                  path: [],
                  cooldowns: { ...u.cooldowns, spawnWasp: anchoring ? 7000 : 0 } 
              };`;

content = content.replace(oldAnchor, newAnchor);
fs.writeFileSync('components/CityMap.tsx', content, 'utf-8');
