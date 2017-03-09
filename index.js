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

  // NOTE: this is reported in B, convert to MB
  var containerSize = Math.ceil(container.Size / 1000000);

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

  var maxSize = (policy.size)
    ? policy.size.max
    : null;

  var warningSize = (policy.size)
    ? policy.size.warning
    : null;

  var failedEnvKeys = [];
  var failedLabels = [];
  var failedVolumes = false;
  var failedPortRequirement = false;
  var failedPortRange = false;
  var failedMaxSize = false;
  var failedWarningSize = false;

  failedWarningSize = (warningSize !== null && containerSize >= warningSize);

  if (maxSize === null ) {

    if (failedWarningSize) {
      console.log("[%s] %dMB container size should be below %dMB", clc.yellow('WARN'), containerSize, warningSize);
    }
    else {
      console.log("[%s] no max container size limit specified", clc.whiteBright('PASS'));
    }

  } else {

    if (containerSize > maxSize) {
      failedMaxSize = true;
      console.log("[%s] %dMB exceeded %dMB max container size limit", clc.red('FAIL'), containerSize, maxSize);
    } else {

      if (failedWarningSize) {
        console.log("[%s] %dMB container size should be below %dMB", clc.yellow('WARN'), containerSize, warningSize);
      }
      else {
        console.log("[%s] %dMB within %dMB max container size limit", clc.whiteBright('PASS'), containerSize, maxSize);
      }
    }

  }  // else maxSize

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
    console.log("[%s] disallowed labels present:", clc.red('FAIL'));
    failedLabels.forEach(function(element, index, array){
      console.log("\t- %s", element);
    });
  } else {
    console.log("[%s] labels validated", clc.whiteBright('PASS'));
  }

  if (failedEnvKeys.length > 0) {
    console.log("[%s] disallowed env keys present:", clc.red('FAIL'));
    failedEnvKeys.forEach(function(element, index, array){
      console.log("\t- %s", element);
    });
  } else {
    console.log("[%s] env keys validated", clc.whiteBright('PASS'));
  }


  if (disallowedVolumes && volumes.length) {
    console.log("[%s] volumes are disallowed", clc.red('FAIL'));
    volumes.forEach(function(element, index, array){
      console.log("\t- %s", element);
    });
    failedVolumes = true;
  } else {
    console.log("[%s] volumes %s", clc.whiteBright('PASS'), disallowedVolumes ? "not allowed, none defined" : "not in use" );
  }

  failedPortRequirement = (portsRequired && !ports.length);

  if (failedPortRequirement) {
    console.log("[%s] exposed port(s) required", clc.red('FAIL'));
  }

  if (portsRange) {
    var split = portsRange.split('-');
    var lowerRange = parseInt(split[0]);
    var upperRange = parseInt(split[1]);

    if (upperRange < lowerRange) {
      console.log('[%s] invalid port range specified', clc.yellowBright('EXCEPTION'));
      failedPortRange = true;
    } else {

      failedPortRange = !ports.every(function(element, index) {
        var portNumber = element.split('/')[0];

        if (portNumber >= lowerRange && portNumber <= upperRange) {
          return true;
        }
        console.log('[%s] port <%d> out of range [%s]', clc.red('FAIL'), portNumber, portsRange);
        return false;
      });

    } // else

  } // if portsRange

  var failedAnyTest = (failedMaxSize || failedEnvKeys.length || failedLabels.length || failedVolumes || failedPortRequirement || failedPortRange);

  if (failedAnyTest) {
    console.log("\nStatus [%s]\n", clc.redBright('FAIL'));
    process.exit(1);
  }

  console.log("\nStatus [%s]\n", clc.green('PASS'));
  process.exit(0);

});
