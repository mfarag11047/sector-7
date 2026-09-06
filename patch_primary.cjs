const fs = require('fs');
let content = fs.readFileSync('components/CityMap.tsx', 'utf-8');
content = content.replace(/primaryUnitId/g, 'unitId');
fs.writeFileSync('components/CityMap.tsx', content, 'utf-8');
