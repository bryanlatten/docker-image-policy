#!/usr/bin/env node
'use strict';

/**
 * Module dependencies.
 */

const getStdin = require('get-stdin');
const program = require('commander');
const fs = require('fs');
const YAML = require('yamljs');
var clc = require('cli-color');

program
  .version('0.2.0')
  .description('Checks a Docker image\'s properties against a policy')
  .usage('[options] <policy file ...>')
  .option('-p, --policy <file>', 'image policy, defaults to ./default_policy.conf')
  .option('-i, --inspect', 'docker inspect output (may also be specified as stdin)')
  .option('-m, --max <size>', 'image size max, in MB', parseInt)
  .option('-w, --warning <size>', 'image size warning, in MB', parseInt)
  .option('-l, --labels <labels>', 'add disallowed labels, comma-separated')
  .option('-e, --envs <keys>', 'add disallowed env keys, comma-separated')
  .option('-r, --range <ports>', 'low-high ports that are allowed')
  .option('--layers_max <count>', 'maximum number of filesystem layers')
  .option('--layers_warning <count>', 'warning number of filesystem layers')

  .parse(process.argv);

var policyFile = (!program.policy || program.policy === true)
                 ? './default_policy.yaml'
                 : 'program.policy';

getStdin().then(str => {

  if(!str.trim()) {
    console.log('\n--- Docker inspect output required ---');
    program.help()
    process.exit(1);
  }

  var input = JSON.parse(str);

  if (!Array.isArray(input) || input[0] === undefined) {
    console.log('Malformed input detected');
    process.exit(1);
  }

  var container = input[0];

  console.log("\nScanning <%s>", container.Id);
  console.log("Docker Build: " + container.DockerVersion);
  console.log("Parent: " + container.Parent);
  console.log("\nUsing policy <%s>\n", policyFile);

  var policy = require("./lib/policy.js")();

  var loadedPolicy = YAML.load(policyFile);

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

  if (!testStatus.isPassing()) {
    console.log("\nStatus [%s]\n", clc.redBright('FAIL'));
    process.exit(1);
  }

  console.log("\nStatus [%s]\n", clc.green('PASS'));
  process.exit(0);

}); // getStdin
