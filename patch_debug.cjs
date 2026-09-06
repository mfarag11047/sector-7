const fs = require('fs');
let content = fs.readFileSync('components/CityMap.tsx', 'utf-8');
content = content.replace(
    'const handleUnitAction = (unitId: string, action: string) => {',
    'const handleUnitAction = (unitId: string, action: string) => {\n      console.log("handleUnitAction called", unitId, action);'
);
fs.writeFileSync('components/CityMap.tsx', content, 'utf-8');
