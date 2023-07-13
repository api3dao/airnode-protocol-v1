const fs = require('fs');
const api3Chains = require('@api3/chains');

fs.writeFileSync(
  'example.env',
  api3Chains.hardhatConfig.getEnvVariableNames().reduce((fileContents, envVariableName) => {
    return fileContents + `${envVariableName}=""\n`;
  }, '')
);
