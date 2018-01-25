"use strict";

var assert = require('assert');
var policy = require('../lib/policy.js')();
var YAML = require('yamljs');
var fs = require('fs');
var R = require('ramda');
var defaultPolicy = YAML.load('./default_policy.yaml');
var emptyContainer = JSON.parse(fs.readFileSync(__dirname + '/fixtures/empty_container.json', 'utf8'))[0];
var failingContainer = JSON.parse(fs.readFileSync(__dirname + '/fixtures/failing_container.json', 'utf8'))[0];

it('succeeds with an empty policy',
function() {
  var testPolicy = {}
  var testContainer = {};

  var result = policy.execute(testPolicy, testContainer);
  assert(result.isPassing());

  // Ensure message count matches test count
  assert(policy.enumerateTests.length === result.getMessages.length);
});

it('succeeds with an empty policy, empty container fixture',
function() {
  var testPolicy = {}
  var testContainer = emptyContainer;

  var result = policy.execute(testPolicy, testContainer);
  assert(result.isPassing());

  // Ensure message count matches test count
  assert(policy.enumerateTests.length === result.getMessages.length);
});

it('fails with violations of the default policy',
function() {

  var testPolicy = defaultPolicy;
  var result = policy.execute(testPolicy, failingContainer);

  assert(!result.isPassing());

  // Ensure message count matches test count
  assert(policy.enumerateTests().length === result.getMessages().length);
});

it('succeeds without disallowed labels',
function() {
  var testPolicy = { labels: { disallow: ['com.swipely.iam-docker.iam-profile', 'ABCDEF'] }};
  var testContainer = { Config: { Labels: { OTHER_ROLE: 12345}}};

  var result = policy.validateLabels(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('fails with disallowed labels',
function() {
  var testPolicy = { labels: { disallow: ['ABCDEF', 'com.swipely.iam-docker.iam-profile']}};
  var testContainer = { Config: { Labels: { 'com.swipely.iam-docker.iam-profile': 12345}}};

  var result = policy.validateLabels(testPolicy, testContainer, policy.msgs());
  assert(!result);
});

it('fails with another disallowed label',
function() {
  var testPolicy = { labels: { disallow: ['com.swipely.iam-docker.msi-explicit-identity']}};
  var testContainer = { Config: { Labels: { 'com.swipely.iam-docker.msi-explicit-identity': 12345}}};

  var result = policy.validateLabels(testPolicy, testContainer, policy.msgs());
  assert(!result);
});

it('succeeds without disallowed env keys',
function() {

  var testPolicy = { labels: { disallow: ['IAM_ROLE', 'ABCDEF'] }};
  var testContainer = { Config: { Env: ['OTHER_ROLE=12345', 'OTHER_OTHER_ROLE=67890']}};

  var result = policy.validateEnvKeys(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('fails with disallowed env keys',
function() {

  var testPolicy = { env_keys: { disallow: ['IAM_ROLE', 'ABCDEF'] }};
  var testContainer = { Config: { Env: ['IAM_ROLE=12345']}};

  var result = policy.validateEnvKeys(testPolicy, testContainer, policy.msgs());
  assert(!result);
});

it('fails with another disallowed env key',
function() {

  var testPolicy = { env_keys: { disallow: ['AGENT_FILL'] }};
  var testContainer = { Config: { Env: ['AGENT_FILL=true']}};

  var result = policy.validateEnvKeys(testPolicy, testContainer, policy.msgs());
  assert(!result);
});

it('succeeds with volumes, default volume restriction (none)',
function() {
  var testPolicy = {};
  var testContainer = { Config: { Volumes: { '/myvolume': {}, '/another-volume': {}}}};

  var result = policy.validateVolumes(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('succeeds without volumes, without restrictions',
function() {
  var testPolicy = { volumes: { disallowed: false }};
  var testContainer = { Config: { Volumes: {}}};

  var result = policy.validateVolumes(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('succeeds with volumes, without restrictions',
function() {
  var testPolicy = { volumes: { disallowed: false }};
  var testContainer = { Config: { Volumes: { '/myvolume': {}, '/another-volume': {}}}};

  var result = policy.validateVolumes(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('succeeds without volumes, with restrictions',
function() {
  var testPolicy = { volumes: { disallowed: true }};
  var testContainer = { Config: { Volumes: {}}};

  var result = policy.validateVolumes(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('fail with volumes, with restrictions',
function() {
  var testPolicy = { volumes: { disallowed: true }};
  var testContainer = { Config: { Volumes: { '/myvolume': {}, '/another-volume': {}}}};

  var result = policy.validateVolumes(testPolicy, testContainer, policy.msgs());
  assert(!result);
});

it('succeeds without ports, without requirement',
function() {
  var testPolicy = { ports: { required: false }};
  var testContainer = {};

  var result = policy.validatePortRequirement(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('fails without ports, with requirement',
function() {
  var testPolicy = { ports: { required: true }};
  var testContainer = {};

  var result = policy.validatePortRequirement(testPolicy, testContainer, policy.msgs());
  assert(!result);
});

it('succeeds with ports, with requirement',
function() {
  var testPolicy = { ports: { required: true }};
  var testContainer = { ContainerConfig: { ExposedPorts: { '8080/tcp': {}, '8081/tcp': {}}}};

  var result = policy.validatePortRequirement(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('succeeds with ports, without requirement',
function() {
  var testPolicy = { ports: { required: false }};
  var testContainer = { ContainerConfig: { ExposedPorts: { '8080/tcp': {}, '8081/tcp': {}}}};

  var result = policy.validatePortRequirement(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('succeeds with ports, without range requirement',
function() {
  var testPolicy = { ports: { range: null }};
  var testContainer = { ContainerConfig: { ExposedPorts: { '8080/tcp': {}, '8081/tcp': {}}}};

  var result = policy.validatePortRange(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('succeeds with ports, within range requirement',
function() {
  var testPolicy = { ports: { range: '1-8082' }};
  var testContainer = { ContainerConfig: { ExposedPorts: { '8080/tcp': {}, '8081/tcp': {}}}};

  var result = policy.validatePortRange(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('fails with ports, with an invalid port range',
function() {
  var testPolicy = { ports: { range: '8081-8080' }};
  var testContainer = { ContainerConfig: { ExposedPorts: { '8080/tcp': {}, '8081/tcp': {}}}};

  var result = policy.validatePortRange(testPolicy, testContainer, policy.msgs());
  assert(!result);
});

// NOTE: this is correct, since a required port is part of validatePortRequirement
it('succeeds without a port, with of port range',
function() {
  var testPolicy = { ports: { range: '1-100' }};
  var testContainer = { ContainerConfig: { ExposedPorts: {}}};

  var result = policy.validatePortRange(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('succeeds without an input port, with a port range',
function() {
  var testPolicy = { ports: { range: '1-100' }};
  var testContainer = { ContainerConfig: {} };

  var result = policy.validatePortRange(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('fails with a port, outside of port range',
function() {
  var testPolicy = { ports: { range: '1-100' }};
  var testContainer = { ContainerConfig: { ExposedPorts: { '101/tcp': {}}}};

  var result = policy.validatePortRange(testPolicy, testContainer, policy.msgs());
  assert(!result);
});

it('fails with ports, one outside of port range',
function() {
  var testPolicy = { ports: { range: '1-100' }};
  var testContainer = { ContainerConfig: { ExposedPorts: { '50/tcp': {}, '101/tcp': {}}}};

  var result = policy.validatePortRange(testPolicy, testContainer, policy.msgs());
  assert(!result);
});

it('fails with ports, both outside of port range',
function() {
  var testPolicy = { ports: { range: '1-100' }};
  var testContainer = { ContainerConfig: { ExposedPorts: { '101/tcp': {}, '102/tcp': {}}}};

  var result = policy.validatePortRange(testPolicy, testContainer, policy.msgs());
  assert(!result);
});

it('succeeds at max size limit',
function() {
  var testPolicy = { size: { max: '10' }};
  var testContainer = { Size: 10000000};

  var result = policy.validateContainerSize(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('fails over max size limit',
function() {
  var testPolicy = { size: { max: '10' }};
  var testContainer = { Size: 10000001 };

  var result = policy.validateContainerSize(testPolicy, testContainer, policy.msgs());
  assert(!result);
});

it('fails when warning >= max size',
function() {
  var testPolicy = { size: { max: 10, warning: 11 }};
  var testContainer = { Size: 10000000 };
  var msgs = policy.msgs();
  var result = policy.validateContainerSize(testPolicy, testContainer, msgs);

  assert(msgs.messages.length === 1);
  assert(msgs.messages.shift()[0] === 'exception'); // Ensure that single message is an exception
  assert(!result);
});

it('succeeds over warning, but under max size limit',
function() {
  var testPolicy = { size: { max: 10, warning: 5 }};
  var testContainer = { Size: 5000001};
  var msgs = policy.msgs();
  var result = policy.validateContainerSize(testPolicy, testContainer, msgs);

  assert(msgs.messages.length === 1);
  assert(msgs.messages.shift()[0] === 'warning'); // Ensure that single message is a warning
  assert(result);
});

it('succeeds over warning, with no max size limit',
function() {
  var testPolicy = { size: { warning: 5 }};
  var testContainer = { Size: 5000001};
  var msgs = policy.msgs();
  var result = policy.validateContainerSize(testPolicy, testContainer, msgs);

  assert(msgs.messages.length === 1);
  assert(msgs.messages.shift()[0] === 'warning'); // Ensure that single message is a warning
  assert(result);
});

it('succeeds without healthcheck, with restriction',
function() {
  var testPolicy = { healthcheck: { disallowed: true }};
  var testContainer = {};
  var msgs = policy.msgs();
  var result = policy.validateHealthCheck(testPolicy, testContainer, msgs);

  assert(result);
});

it('succeeds with "none" healthcheck, with restriction',
function() {
  var testPolicy = { healthcheck: { disallowed: true }};
  var testContainer = { ContainerConfig: { Healthcheck: { Test: ['NONE']}}};
  var msgs = policy.msgs();
  var result = policy.validateHealthCheck(testPolicy, testContainer, msgs);

  assert(result);
});

it('succeeds with healthcheck, without restriction',
function() {
  var testPolicy = { healthcheck: { disallowed: false }};
  var testContainer = { ContainerConfig: { Healthcheck: { Test: ['CMD-SHELL', 'ls -l']}}};
  var msgs = policy.msgs();
  var result = policy.validateHealthCheck(testPolicy, testContainer, msgs);

  assert(result);
});

it('succeeds with healthcheck, with default (not restricted)',
function() {
  var testPolicy = { healthcheck: { disallowed: false }};
  var testContainer = { ContainerConfig: { Healthcheck: { Test: ['CMD-SHELL', 'ls -l']}}};
  var msgs = policy.msgs();
  var result = policy.validateHealthCheck(testPolicy, testContainer, msgs);

  assert(result);
});

it('fails with healthcheck, with restriction',
function() {
  var testPolicy = { healthcheck: { disallowed: true }};
  var testContainer = { ContainerConfig: { Healthcheck: { Test: ['CMD-SHELL', 'ls -l']}}};
  var msgs = policy.msgs();
  var result = policy.validateHealthCheck(testPolicy, testContainer, msgs);

  assert(!result);
});

it('succeeds at max layer count',
function() {
  var testContainer = R.clone(failingContainer);
  assert(testContainer.RootFS.Layers.length > 0);

  var testPolicy = { layers: { max: testContainer.RootFS.Layers.length }};

  var result = policy.validateLayerCount(testPolicy, testContainer, policy.msgs());
  assert(result);
});

it('fails over max size limit',
function() {
  var testPolicy = { layers: { max: '1' }};
  assert(emptyContainer.RootFS.Layers.length > 1);

  var result = policy.validateLayerCount(testPolicy, emptyContainer, policy.msgs());
  assert(!result);
});

it('fails when warning >= max layer count',
function() {
  var testPolicy = { layers: { max: 10, warning: 11 }};
  var msgs = policy.msgs();
  var result = policy.validateLayerCount(testPolicy, emptyContainer, msgs);

  assert(msgs.messages.length === 1);
  assert(msgs.messages.shift()[0] === 'exception'); // Ensure that single message is an exception
  assert(!result);
});

it('succeeds over warning, but under max size limit',
function() {
  var newMax = (emptyContainer.RootFS.Layers.length + 1);
  var newWarning = 1;
  var testPolicy = { layers: { max: newMax, warning: newWarning }};
  assert(emptyContainer.RootFS.Layers.length < newMax && emptyContainer.RootFS.Layers.length > newWarning);

  var msgs = policy.msgs();
  var result = policy.validateLayerCount(testPolicy, emptyContainer, msgs);

  // Ensure there is only a single message in the stack
  assert(msgs.messages.length === 1);

  // Ensure that single message is a warning
  assert(msgs.messages.shift()[0] === 'warning');
  assert(result);
});

it('succeeds over warning, with no max size limit',
function() {
  var newWarning = 1;
  var testPolicy = { layers: { warning: newWarning }};
  assert(emptyContainer.RootFS.Layers.length > newWarning);
  var testContainer = R.clone(emptyContainer);
  var msgs = policy.msgs();
  var result = policy.validateLayerCount(testPolicy, testContainer, msgs);

  assert(msgs.messages.length === 1);
  assert(msgs.messages.shift()[0] === 'warning'); // Ensure that single message is a warning
  assert(result);
});

it('adds all overrides against an empty policy',
function() {
  var myPolicy = {};
  var maxSize = 50;
  var warningSize = 25;
  var disallowedLabels = 'ABC,DEF';
  var disallowedEnvs = 'IAM,ROLE';
  var maxLayers = 50;
  var warningLayers = 10;

  var inputs = {
    max: maxSize,
    warning: warningSize,
    labels: disallowedLabels,
    envs: disallowedEnvs,
    layers_max: maxLayers,
    layers_warning: warningLayers
  };

  var newPolicy = policy.applyOverrides(myPolicy, inputs, []);

  assert(maxSize === newPolicy.size.max);
  assert(warningSize === newPolicy.size.warning);
  assert.deepEqual(disallowedLabels.split(','), newPolicy.labels.disallow);
  assert.deepEqual(disallowedEnvs.split(','), newPolicy.env_keys.disallow);
});

it('overrides existing policy',
function() {
  var myPolicy = {
    size: {
      max: 654,
      warning: 321
    },
    env_keys: {
      disallow: [ 'KEY1', 'KEY2' ]
    },
    labels: {
      disallow: [ 'LABEL1', 'LABEL2' ]
    },
    ports: {
      range: '1-10000'
    },
    layers: {
      max: 100,
      warning: 1
    }
  };

  var maxSize = 9876;
  var warningSize = 5432;
  var disallowedLabels = 'UPDATED,LABELS';
  var disallowedEnvs = 'ENVROLES,HAVEBEENUPDATED';
  var newRange = '1-10';
  var maxLayers = 50;
  var warningLayers = 10;

  var inputs = {
    max: maxSize,
    warning: warningSize,
    labels: disallowedLabels,
    envs: disallowedEnvs,
    range: newRange,
    layers_max: maxLayers,
    layers_warning: warningLayers
  };

  var newPolicy = policy.applyOverrides(myPolicy, inputs, []);

  assert.strictEqual(maxSize, newPolicy.size.max);
  assert.strictEqual(warningSize, newPolicy.size.warning);
  assert.notStrictEqual(myPolicy.size.max, newPolicy.size.max);
  assert.notStrictEqual(myPolicy.size.warning, newPolicy.size.warning);
  assert.strictEqual(newRange, newPolicy.ports.range);

  assert.deepEqual(disallowedLabels.split(','), newPolicy.labels.disallow);
  assert.notDeepEqual(myPolicy.labels.disallow, newPolicy.labels.disallow);

  assert.deepEqual(disallowedEnvs.split(','), newPolicy.env_keys.disallow);
  assert.notDeepEqual(myPolicy.env_keys.disallow, newPolicy.env_keys.disallow);

  assert.strictEqual(maxLayers, newPolicy.layers.max);
  assert.strictEqual(warningLayers, newPolicy.layers.warning);
});
