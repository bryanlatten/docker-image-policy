#!/usr/bin/env node
'use strict';

const getStdin = require('get-stdin');
const program = require('commander');
const fs = require('fs');
const YAML = require('yamljs');
var clc = require('cli-color');

program
  .version('0.0.1')
  .description('Checks a Docker image\'s properties against a policy')
  .usage('[options] <policy file ...>')
  .option('-p, --policy [file]', 'image policy')
  .option('-i, --inspect', 'docker inspect output (may also be specified as stdin)')
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

  if(!Array.isArray(input) || input[0] === undefined) {
    console.log('Malformed input detected');
    process.exit(1);
  }

  var container = input[0];

  console.log("\nScanning <%s>", container.Id);
  console.log("Docker Build: " + container.DockerVersion);
  console.log("Parent: " + container.Parent);
  console.log("\nUsing policy <%s>\n", policyFile);

  var loadedPolicy = YAML.load(policyFile);
  var policy = require("./lib/policy.js")(loadedPolicy, input[0]);


  var passedTests = policy.execute();

  policy.exceptionMsgs.forEach(function(element) {
    console.log("[%s] %s", clc.yellowBright('EXCEPTION'), element);
  });

  policy.successMsgs.forEach(function(element) {
    console.log("[%s] %s", clc.whiteBright('PASS'), element);
  });

  policy.warningMsgs.forEach(function(element) {
    console.log("[%s] %s", clc.magenta('WARN'), element);
  });

  policy.failureMsgs.forEach(function(element) {
    console.log("[%s] %s", clc.red('FAIL'), element);
  });

  if (!passedTests) {
    console.log("\nStatus [%s]\n", clc.redBright('FAIL'));
    process.exit(1);
  }

  console.log("\nStatus [%s]\n", clc.green('PASS'));
  process.exit(0);

});
