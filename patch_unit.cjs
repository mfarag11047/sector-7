const fs = require('fs');
let content = fs.readFileSync('components/Unit.tsx', 'utf-8');
content = content.replace(
    'onAction: (action: string) => void;',
    'onAction: (id: string, action: string) => void;'
);
content = content.replace(
    'const handleMenuAction = (action: string) => {\n    onAction(action);\n  };',
    'const handleMenuAction = (action: string) => {\n    onAction(id, action);\n  };'
);
fs.writeFileSync('components/Unit.tsx', content, 'utf-8');
