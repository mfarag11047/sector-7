const fs = require('fs');
let content = fs.readFileSync('components/CityMap.tsx', 'utf-8');

// 1. Fix findPath
const oldFindPath = `                  if ((dynamicRoadTileSet.has(nId) || nId === endId) && !visited.has(nId)) {`;
const newFindPath = `                  if (dynamicRoadTileSet.has(nId) && !visited.has(nId)) {`;
content = content.replace(oldFindPath, newFindPath);

// 2. Fix Mason target distance
const oldMason = `                     const dist = Math.sqrt(Math.pow(u.gridPos.x - targetPos.x, 2) + Math.pow(u.gridPos.z - targetPos.z, 2));
                     if (dist === 0) {`;
const newMason = `                     const dist = Math.sqrt(Math.pow(u.gridPos.x - targetPos.x, 2) + Math.pow(u.gridPos.z - targetPos.z, 2));
                     if (dist < 1.5) {`;
content = content.replace(oldMason, newMason);

// 3. Fix Crawler drone patrol selection
const oldCrawler = `                                      if (d <= range && rx >= 0 && rx < CITY_CONFIG.gridSize && rz >= 0 && rz < CITY_CONFIG.gridSize) {
                                          targetPos = { x: rx, z: rz };
                                      }`;
const newCrawler = `                                      if (d <= range && rx >= 0 && rx < CITY_CONFIG.gridSize && rz >= 0 && rz < CITY_CONFIG.gridSize) {
                                          if (dynamicRoadTileSet.has((rx << 16) | rz)) {
                                              targetPos = { x: rx, z: rz };
                                          }
                                      }`;
content = content.replace(oldCrawler, newCrawler);

fs.writeFileSync('components/CityMap.tsx', content, 'utf-8');
console.log("Patched successfully");
