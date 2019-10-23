#!/usr/bin/env node

/**
 * Module dependencies.
 */

const getStdin = require('get-stdin');
const program = require('commander');
const yaml = require('js-yaml');

const fs = require('fs');
const path = require('path');

const DEFAULT_POLICY = 'default_policy.yaml';

var clc = require('cli-color');

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

var policyFile = program.policy || `./${DEFAULT_POLICY}`;
var policyPath = path.resolve(policyFile)

if (!fs.existsSync(policyPath)) {
  console.log('[%s] policy does not exist: %s', clc.redBright('Error'), clc.whiteBright(policyFile));
  process.exit(1);
}

// File reading is delegated to YAML library, which does poor error handling
if (fs.statSync(policyPath).isDirectory()) {
  console.log('[%s] cannot read policy: %s', clc.redBright('Error'), clc.whiteBright(policyFile));
  process.exit(1);
}

getStdin().then(str => {

  if(!str.trim()) {
    console.log('\n--- Docker inspect output required ---');
    program.help()
    process.exit(1);
  }

  var input = JSON.parse(str);

  if (!Array.isArray(input) || input[0] === undefined) {
    console.log('[%s] malformed input detected', clc.redBright('Error'));
    process.exit(1);
  }

  var container = input[0];

  console.log("\nScanning <%s>", container.Id);
  console.log("Docker Build: " + container.DockerVersion);
  console.log("Parent: " + container.Parent);
  console.log("\nUsing policy <%s>\n", policyFile);

  var policy = require("./lib/policy.js")();
  var loadedPolicy;

  try {
    loadedPolicy = yaml.safeLoad(fs.readFileSync(policyPath, 'utf8'))
  }
  catch (err) {
    console.log('[%s] unable to parse policy YAML:', clc.redBright('Error'), err.reason);
    process.exit(1);
  }

  var overrideMsgs = [];
  loadedPolicy = policy.applyOverrides(loadedPolicy, program, overrideMsgs);

  overrideMsgs.forEach(function(text) {
    console.log('<%s> %s', clc.cyanBright('Policy Override'), text);
  });

  if (overrideMsgs.length > 0) {
    console.log(''); // Inserts a new line
  }

  var testStatus = policy.execute(loadedPolicy, container);

  testStatus.getMessages().forEach(function(msg) {

    var severity = msg[0];
    var text = msg[1];

    switch(severity) {
      case 'exception':
        console.log("[%s] %s", clc.magenta('EXCEPTION'), text);
        break;
      case 'success':
        console.log("[%s] %s", clc.whiteBright('PASS'), text);
        break;
      case 'failure':
        console.log("[%s] %s", clc.red('FAIL'), text);
        break;
      case 'warning':
        console.log("[%s] %s", clc.yellowBright('WARN'), text);
        break;
      default:
        console.log("[%s %s", clc.blue('UNKOWN'), text);
        break;
    } // switch severity

  });

  var testIsPassing = testStatus.isPassing();
  var testMessage = (testIsPassing)
                    ? clc.green('PASS')
                    : clc.redBright('FAIL');

  console.log("\nStatus [%s]\n", testMessage);
  process.exit(testIsPassing ? 0 : 1);

}); // getStdin
