const fs = require('fs');
let content = fs.readFileSync('components/CityMap.tsx', 'utf-8');
content = content.replace(
  `  }, [doctrines, findPath]);`,
  `  }, [doctrines, findPath, dynamicRoadTileSet]);`
);
fs.writeFileSync('components/CityMap.tsx', content, 'utf-8');
