#!/usr/bin/env node

const clc = require('cli-color');
const fs = require('fs');
const getStdin = require('get-stdin');
const path = require('path');
const program = require('commander');
const yaml = require('js-yaml');

const policyEngine = require('./lib/policyengine.js');

const DEFAULT_POLICY = 'default_policy.yaml';

program
  .description('Checks a Docker image\'s properties against a policy')
  .option('-p, --policy <file>', 'image policy, defaults to ./default_policy.yaml')
  .option('-i, --inspect', 'docker inspect output (may also be specified as stdin)')
  .option('-m, --max <size>', 'image size max, in MB', parseInt)
  .option('-w, --warning <size>', 'image size warning, in MB', parseInt)
  .option('-l, --labels <labels>', 'add disallowed labels, comma-separated')
  .option('-e, --envs <keys>', 'add disallowed env keys, comma-separated')
  .option('-r, --range <ports>', 'low-high ports that are allowed')
  .option('--layers_max <count>', 'maximum number of filesystem layers')
  .option('--layers_warning <count>', 'warning number of filesystem layers')
  .parse(process.argv);

const policyFile = program.policy || `./${DEFAULT_POLICY}`;
const policyPath = path.resolve(policyFile);

if (!fs.existsSync(policyPath)) {
  console.log('[%s] policy does not exist: %s', clc.redBright('Error'), clc.whiteBright(policyFile));
  process.exit(1);
}

// File reading is delegated to YAML library, which does poor error handling
if (fs.statSync(policyPath).isDirectory()) {
  console.log('[%s] cannot read policy: %s', clc.redBright('Error'), clc.whiteBright(policyFile));
  process.exit(1);
}

getStdin().then((str) => {
  if (!str.trim()) {
    console.log('\n--- Docker inspect output required ---\n');
    program.outputHelp();
    process.exit(1);
  }

  const input = JSON.parse(str);

  if (!Array.isArray(input) || input[0] === undefined) {
    console.log('[%s] malformed input detected', clc.redBright('Error'));
    process.exit(1);
  }

  const container = input[0];

  console.log('\nScanning <%s>', container.Id);
  console.log(`Docker Build: ${container.DockerVersion}`);
  console.log(`Parent: ${container.Parent}`);
  console.log('\nUsing policy <%s>\n', policyFile);

  let loadedPolicy;

  try {
    loadedPolicy = yaml.safeLoad(fs.readFileSync(policyPath, 'utf8'));
  } catch (err) {
    console.log('[%s] unable to parse policy YAML:', clc.redBright('Error'), err.reason);
    process.exit(1);
  }

  const overrideMsgs = [];
  loadedPolicy = policyEngine.applyOverrides(loadedPolicy, program, overrideMsgs);

  overrideMsgs.forEach((text) => {
    console.log('<%s> %s', clc.cyanBright('Policy Override'), text);
  });

  if (overrideMsgs.length > 0) {
    console.log(''); // Inserts a new line
  }

  const testStatus = policyEngine.execute(loadedPolicy, container);

  testStatus.getMessages().forEach((msg) => {
    const severity = msg[0];
    const text = msg[1];

    switch (severity) {
      case 'exception':
        console.log('[%s] %s', clc.magenta('EXCEPTION'), text);
        break;
      case 'success':
        console.log('[%s] %s', clc.whiteBright('PASS'), text);
        break;
      case 'failure':
        console.log('[%s] %s', clc.red('FAIL'), text);
        break;
      case 'warning':
        console.log('[%s] %s', clc.yellowBright('WARN'), text);
        break;
      default:
        console.log('[%s %s', clc.blue('UNKOWN'), text);
        break;
    }
  });

  const testIsPassing = testStatus.isPassing();
  const testMessage = (testIsPassing)
    ? clc.green('PASS')
    : clc.redBright('FAIL');

  console.log('\nStatus [%s]\n', testMessage);
  process.exit(testIsPassing ? 0 : 1);
});
