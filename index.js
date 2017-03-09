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

// if (!fs.stat(policyFile)) {
//   console.log('Unable to stat policy <%s>', policyFile);
// }

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

  var ports = (container.ContainerConfig.ExposedPorts)
    ? Object.keys(container.ContainerConfig.ExposedPorts)
    : [];

  var labels = (container.Config.Labels)
    ? Object.keys(container.Config.Labels)
    : [];

  var volumes = (container.Config.Volumes)
    ? Object.keys(container.Config.Volumes)
    : [];

  var envsShell = (container.Config.Env)
    ? container.Config.Env
    : [];

  var envKeys = [];

  // Environment variables are in shell syntax (key=value), and need to be extracted
  envsShell.forEach(function callback(value, index, array) {
    var element = value.split('=')[0];
    envKeys.push(element);
  });

  console.log("\nScanning <%s>", container.Id);
  console.log("Docker Build: " + container.DockerVersion);
  console.log("Parent: " + container.Parent);
  console.log("\nUsing policy <%s>\n", policyFile);

  var policy = YAML.load(policyFile);

  var disallowedEnvKeys = (policy.env_keys)
    ? policy.env_keys.disallow
    : [];

  var disallowedLabels = (policy.labels)
    ? policy.labels.disallow
    : [];

  // Currently only a simple flag on or off
  var disallowedVolumes = (policy.volumes)
    ? !!policy.volumes.disallowed
    : false;

  var portsRequired = (policy.ports)
    ? !!policy.ports.required
    : false;

  var portsRange = (policy.ports)
    ? policy.ports.range
    : null;

  var failedEnvKeys = [];
  var failedLabels = [];
  var failedVolumes = false;
  var failedPortRequirement = false;
  var failedPortRange = false;

  envKeys.forEach(function(element, index, array) {
    if (disallowedEnvKeys.indexOf(element) !== -1) {
      failedEnvKeys.push(element);
    }
  });

  labels.forEach(function(element, index, array) {
    if (disallowedLabels.indexOf(element) !== -1) {
      failedLabels.push(element);
    }
  });

  if (failedLabels.length > 0) {
    console.log("[FAIL] disallowed labels present:");
    failedLabels.forEach(function(element, index, array){
      console.log("\t- %s", element);
    });
  } else {
    console.log("[%s] labels validated", 'PASS');
  }

  if (failedEnvKeys.length > 0) {
    console.log("[FAIL] disallowed env keys present:");
    failedEnvKeys.forEach(function(element, index, array){
      console.log("\t- %s", element);
    });
  } else {
    console.log("[%s] env keys validated", 'PASS');
  }


  if (disallowedVolumes && volumes.length) {
    console.log("[FAIL] volumes are disallowed");
    volumes.forEach(function(element, index, array){
      console.log("\t- %s", element);
    });
    failedVolumes = true;
  } else {
    console.log("[PASS] no volumes %s", disallowedVolumes ? "allowed, none defined" : "in use" );
  }

  if (portsRequired && !ports.length) {
    failedPortRequirement = true;
    console.log("[%s] exposed port(s) required", 'FAIL');
  }

  if (portsRange) {
    var split = portsRange.split('-'),
        lowerRange = parseInt(split[0]),
        upperRange = parseInt(split[1]);

    if (upperRange < lowerRange) {
      console.log('[%s] invalid port range specific', 'EXCEPTION');
      failedPortRange = true;
    } else {

      failedPortRange = !ports.every(function(element, index) {
        var portNumber = element.split('/')[0];

        if (portNumber >= lowerRange && portNumber <= upperRange) {
          return true;
        }
        console.log('[%s] port <%d> out of range [%s]', 'FAIL', portNumber, portsRange);
        return false;
      });

    } // else

  } // if portsRange

  var failedAnyTest = (failedEnvKeys.length || failedLabels.length || failedVolumes || failedPortRequirement || failedPortRange);

  if (failedAnyTest) {
    console.log("\nStatus [%s]\n", clc.red('FAIL'));
    process.exit(1);
  }

  console.log("\nStatus [%s]\n", clc.green('PASS'));
  process.exit(0);

});
