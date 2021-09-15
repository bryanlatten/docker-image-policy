const assert = require('assert');
const fs = require('fs');
const yaml = require('js-yaml');

const policyEngine = require('../lib/policyengine');

const defaultPolicy = yaml.load(fs.readFileSync('./default_policy.yaml', 'utf8'));
const emptyContainer = JSON.parse(fs.readFileSync(`${__dirname}/fixtures/empty_container.json`, 'utf8'))[0];
const failingContainer = JSON.parse(fs.readFileSync(`${__dirname}/fixtures/failing_container.json`, 'utf8'))[0];

it('succeeds with an empty policy', () => {
  const testPolicy = {};
  const testContainer = {};

  const result = policyEngine.execute(testPolicy, testContainer);
  assert(result.isPassing());

  // Ensure message count matches test count
  assert(policyEngine.enumerateTests.length === result.getMessages.length);
});

it('succeeds with an empty policy, empty container fixture', () => {
  const testPolicy = {};
  const testContainer = emptyContainer;

  const result = policyEngine.execute(testPolicy, testContainer);
  assert(result.isPassing());

  // Ensure message count matches test count
  assert(policyEngine.enumerateTests.length === result.getMessages.length);
});

it('fails with violations of the default policy', () => {
  const testPolicy = defaultPolicy;
  const result = policyEngine.execute(testPolicy, failingContainer);

  assert(!result.isPassing());

  // Ensure message count matches test count
  assert(policyEngine.enumerateTests().length === result.getMessages().length);
});

it('succeeds without disallowed labels', () => {
  const testPolicy = { labels: { disallow: ['com.swipely.iam-docker.iam-profile', 'ABCDEF'] } };
  const testContainer = { Config: { Labels: { OTHER_ROLE: 12345 } } };

  const result = policyEngine.validateLabels(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('fails with disallowed labels', () => {
  const testPolicy = { labels: { disallow: ['ABCDEF', 'com.swipely.iam-docker.iam-profile'] } };
  const testContainer = { Config: { Labels: { 'com.swipely.iam-docker.iam-profile': 12345 } } };

  const result = policyEngine.validateLabels(testPolicy, testContainer, policyEngine.msgs());
  assert(!result);
});

it('fails with another disallowed label', () => {
  const testPolicy = { labels: { disallow: ['com.swipely.iam-docker.msi-explicit-identity'] } };
  const testContainer = { Config: { Labels: { 'com.swipely.iam-docker.msi-explicit-identity': 12345 } } };

  const result = policyEngine.validateLabels(testPolicy, testContainer, policyEngine.msgs());
  assert(!result);
});

it('succeeds without disallowed env keys', () => {
  const testPolicy = { labels: { disallow: ['IAM_ROLE', 'ABCDEF'] } };
  const testContainer = { Config: { Env: ['OTHER_ROLE=12345', 'OTHER_OTHER_ROLE=67890'] } };

  const result = policyEngine.validateEnvKeys(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('fails with disallowed env keys', () => {
  const testPolicy = { env_keys: { disallow: ['IAM_ROLE', 'ABCDEF'] } };
  const testContainer = { Config: { Env: ['IAM_ROLE=12345'] } };

  const result = policyEngine.validateEnvKeys(testPolicy, testContainer, policyEngine.msgs());
  assert(!result);
});

it('fails with another disallowed env key', () => {
  const testPolicy = { env_keys: { disallow: ['AGENT_FILL'] } };
  const testContainer = { Config: { Env: ['AGENT_FILL=true'] } };

  const result = policyEngine.validateEnvKeys(testPolicy, testContainer, policyEngine.msgs());
  assert(!result);
});

it('succeeds with volumes, default volume restriction (none)', () => {
  const testPolicy = {};
  const testContainer = { Config: { Volumes: { '/myvolume': {}, '/another-volume': {} } } };

  const result = policyEngine.validateVolumes(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('succeeds without volumes, without restrictions', () => {
  const testPolicy = { volumes: { disallowed: false } };
  const testContainer = { Config: { Volumes: {} } };

  const result = policyEngine.validateVolumes(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('succeeds with volumes, without restrictions', () => {
  const testPolicy = { volumes: { disallowed: false } };
  const testContainer = { Config: { Volumes: { '/myvolume': {}, '/another-volume': {} } } };

  const result = policyEngine.validateVolumes(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('succeeds without volumes, with restrictions', () => {
  const testPolicy = { volumes: { disallowed: true } };
  const testContainer = { Config: { Volumes: {} } };

  const result = policyEngine.validateVolumes(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('fail with volumes, with restrictions', () => {
  const testPolicy = { volumes: { disallowed: true } };
  const testContainer = { Config: { Volumes: { '/myvolume': {}, '/another-volume': {} } } };

  const result = policyEngine.validateVolumes(testPolicy, testContainer, policyEngine.msgs());
  assert(!result);
});

it('succeeds without ports, without requirement', () => {
  const testPolicy = { ports: { required: false } };
  const testContainer = {};

  const result = policyEngine.validatePortRequirement(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('fails without ports, with requirement', () => {
  const testPolicy = { ports: { required: true } };
  const testContainer = {};

  const result = policyEngine.validatePortRequirement(testPolicy, testContainer, policyEngine.msgs());
  assert(!result);
});

it('succeeds with ports, with requirement', () => {
  const testPolicy = { ports: { required: true } };
  const testContainer = { ContainerConfig: { ExposedPorts: { '8080/tcp': {}, '8081/tcp': {} } } };

  const result = policyEngine.validatePortRequirement(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('succeeds with ports, without requirement', () => {
  const testPolicy = { ports: { required: false } };
  const testContainer = { ContainerConfig: { ExposedPorts: { '8080/tcp': {}, '8081/tcp': {} } } };

  const result = policyEngine.validatePortRequirement(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('succeeds with ports, without range requirement', () => {
  const testPolicy = { ports: { range: null } };
  const testContainer = { ContainerConfig: { ExposedPorts: { '8080/tcp': {}, '8081/tcp': {} } } };

  const result = policyEngine.validatePortRange(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('succeeds with ports, within range requirement', () => {
  const testPolicy = { ports: { range: '1-8082' } };
  const testContainer = { ContainerConfig: { ExposedPorts: { '8080/tcp': {}, '8081/tcp': {} } } };

  const result = policyEngine.validatePortRange(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('fails with ports, with an invalid port range', () => {
  const testPolicy = { ports: { range: '8081-8080' } };
  const testContainer = { ContainerConfig: { ExposedPorts: { '8080/tcp': {}, '8081/tcp': {} } } };

  const result = policyEngine.validatePortRange(testPolicy, testContainer, policyEngine.msgs());
  assert(!result);
});

// NOTE: this is correct, since a required port is part of validatePortRequirement
it('succeeds without a port, with of port range', () => {
  const testPolicy = { ports: { range: '1-100' } };
  const testContainer = { ContainerConfig: { ExposedPorts: {} } };

  const result = policyEngine.validatePortRange(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('succeeds without an input port, with a port range', () => {
  const testPolicy = { ports: { range: '1-100' } };
  const testContainer = { ContainerConfig: {} };

  const result = policyEngine.validatePortRange(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('fails with a port, outside of port range', () => {
  const testPolicy = { ports: { range: '1-100' } };
  const testContainer = { ContainerConfig: { ExposedPorts: { '101/tcp': {} } } };

  const result = policyEngine.validatePortRange(testPolicy, testContainer, policyEngine.msgs());
  assert(!result);
});

it('fails with ports, one outside of port range', () => {
  const testPolicy = { ports: { range: '1-100' } };
  const testContainer = { ContainerConfig: { ExposedPorts: { '50/tcp': {}, '101/tcp': {} } } };

  const result = policyEngine.validatePortRange(testPolicy, testContainer, policyEngine.msgs());
  assert(!result);
});

it('fails with ports, both outside of port range', () => {
  const testPolicy = { ports: { range: '1-100' } };
  const testContainer = { ContainerConfig: { ExposedPorts: { '101/tcp': {}, '102/tcp': {} } } };

  const result = policyEngine.validatePortRange(testPolicy, testContainer, policyEngine.msgs());
  assert(!result);
});

it('succeeds at max size limit', () => {
  const testPolicy = { size: { max: '10' } };
  const testContainer = { Size: 10000000 };

  const result = policyEngine.validateContainerSize(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('fails over max size limit', () => {
  const testPolicy = { size: { max: '10' } };
  const testContainer = { Size: 10000001 };

  const result = policyEngine.validateContainerSize(testPolicy, testContainer, policyEngine.msgs());
  assert(!result);
});

it('fails when warning >= max size', () => {
  const testPolicy = { size: { max: 10, warning: 11 } };
  const testContainer = { Size: 10000000 };
  const msgs = policyEngine.msgs();
  const result = policyEngine.validateContainerSize(testPolicy, testContainer, msgs);

  assert(msgs.messages.length === 1);
  assert(msgs.messages.shift()[0] === 'exception'); // Ensure that single message is an exception
  assert(!result);
});

it('succeeds over warning, but under max size limit', () => {
  const testPolicy = { size: { max: 10, warning: 5 } };
  const testContainer = { Size: 5000001 };
  const msgs = policyEngine.msgs();
  const result = policyEngine.validateContainerSize(testPolicy, testContainer, msgs);

  assert(msgs.messages.length === 1);
  assert(msgs.messages.shift()[0] === 'warning'); // Ensure that single message is a warning
  assert(result);
});

it('succeeds over warning, with no max size limit', () => {
  const testPolicy = { size: { warning: 5 } };
  const testContainer = { Size: 5000001 };
  const msgs = policyEngine.msgs();
  const result = policyEngine.validateContainerSize(testPolicy, testContainer, msgs);

  assert(msgs.messages.length === 1);
  assert(msgs.messages.shift()[0] === 'warning'); // Ensure that single message is a warning
  assert(result);
});

it('succeeds without healthcheck, with restriction', () => {
  const testPolicy = { healthcheck: { disallowed: true } };
  const testContainer = {};
  const msgs = policyEngine.msgs();
  const result = policyEngine.validateHealthCheck(testPolicy, testContainer, msgs);

  assert(result);
});

it('succeeds with "none" healthcheck, with restriction', () => {
  const testPolicy = { healthcheck: { disallowed: true } };
  const testContainer = { ContainerConfig: { Healthcheck: { Test: ['NONE'] } } };
  const msgs = policyEngine.msgs();
  const result = policyEngine.validateHealthCheck(testPolicy, testContainer, msgs);

  assert(result);
});

it('succeeds with healthcheck, without restriction', () => {
  const testPolicy = { healthcheck: { disallowed: false } };
  const testContainer = { ContainerConfig: { Healthcheck: { Test: ['CMD-SHELL', 'ls -l'] } } };
  const msgs = policyEngine.msgs();
  const result = policyEngine.validateHealthCheck(testPolicy, testContainer, msgs);

  assert(result);
});

it('succeeds with healthcheck, with default (not restricted)', () => {
  const testPolicy = { healthcheck: { disallowed: false } };
  const testContainer = { ContainerConfig: { Healthcheck: { Test: ['CMD-SHELL', 'ls -l'] } } };
  const msgs = policyEngine.msgs();
  const result = policyEngine.validateHealthCheck(testPolicy, testContainer, msgs);

  assert(result);
});

it('fails with healthcheck, with restriction', () => {
  const testPolicy = { healthcheck: { disallowed: true } };
  const testContainer = { ContainerConfig: { Healthcheck: { Test: ['CMD-SHELL', 'ls -l'] } } };
  const msgs = policyEngine.msgs();
  const result = policyEngine.validateHealthCheck(testPolicy, testContainer, msgs);

  assert(!result);
});

it('succeeds at max layer count', () => {
  const testContainer = { ...failingContainer };
  assert(testContainer.RootFS.Layers.length > 0);

  const testPolicy = { layers: { max: testContainer.RootFS.Layers.length } };

  const result = policyEngine.validateLayerCount(testPolicy, testContainer, policyEngine.msgs());
  assert(result);
});

it('fails over max size limit', () => {
  const testPolicy = { layers: { max: '1' } };
  assert(emptyContainer.RootFS.Layers.length > 1);

  const result = policyEngine.validateLayerCount(testPolicy, emptyContainer, policyEngine.msgs());
  assert(!result);
});

it('fails when warning >= max layer count', () => {
  const testPolicy = { layers: { max: 10, warning: 11 } };
  const msgs = policyEngine.msgs();
  const result = policyEngine.validateLayerCount(testPolicy, emptyContainer, msgs);

  assert(msgs.messages.length === 1);
  assert(msgs.messages.shift()[0] === 'exception'); // Ensure that single message is an exception
  assert(!result);
});

it('succeeds over warning, but under max size limit', () => {
  const newMax = (emptyContainer.RootFS.Layers.length + 1);
  const newWarning = 1;
  const testPolicy = { layers: { max: newMax, warning: newWarning } };
  const layerCount = emptyContainer.RootFS.Layers.length;
  assert(layerCount < newMax);
  assert(layerCount > newWarning);

  const msgs = policyEngine.msgs();
  const result = policyEngine.validateLayerCount(testPolicy, emptyContainer, msgs);

  // Ensure there is only a single message in the stack
  assert(msgs.messages.length === 1);

  // Ensure that single message is a warning
  assert(msgs.messages.shift()[0] === 'warning');
  assert(result);
});

it('succeeds over warning, with no max size limit', () => {
  const newWarning = 1;
  const testPolicy = { layers: { warning: newWarning } };
  assert(emptyContainer.RootFS.Layers.length > newWarning);
  const testContainer = { ...emptyContainer };
  const msgs = policyEngine.msgs();
  const result = policyEngine.validateLayerCount(testPolicy, testContainer, msgs);

  assert(msgs.messages.length === 1);
  assert(msgs.messages.shift()[0] === 'warning'); // Ensure that single message is a warning
  assert(result);
});

it('adds all overrides against an empty policy', () => {
  const myPolicy = {};
  const maxSize = 50;
  const warningSize = 25;
  const disallowedLabels = 'ABC,DEF';
  const disallowedEnvs = 'IAM,ROLE';
  const maxLayers = 50;
  const warningLayers = 10;

  const inputs = {
    max: maxSize,
    warning: warningSize,
    labels: disallowedLabels,
    envs: disallowedEnvs,
    layers_max: maxLayers,
    layers_warning: warningLayers,
  };

  const newPolicy = policyEngine.applyOverrides(myPolicy, inputs, []);

  assert(maxSize === newPolicy.size.max);
  assert(warningSize === newPolicy.size.warning);
  assert.deepEqual(disallowedLabels.split(','), newPolicy.labels.disallow);
  assert.deepEqual(disallowedEnvs.split(','), newPolicy.env_keys.disallow);
});

it('overrides existing policy', () => {
  const myPolicy = {
    size: {
      max: 654,
      warning: 321,
    },
    env_keys: {
      disallow: ['KEY1', 'KEY2'],
    },
    labels: {
      disallow: ['LABEL1', 'LABEL2'],
    },
    ports: {
      range: '1-10000',
    },
    layers: {
      max: 100,
      warning: 1,
    },
  };

  const maxSize = 9876;
  const warningSize = 5432;
  const disallowedLabels = 'UPDATED,LABELS';
  const disallowedEnvs = 'ENVROLES,HAVEBEENUPDATED';
  const newRange = '1-10';
  const maxLayers = 50;
  const warningLayers = 10;

  const inputs = {
    max: maxSize,
    warning: warningSize,
    labels: disallowedLabels,
    envs: disallowedEnvs,
    range: newRange,
    layers_max: maxLayers,
    layers_warning: warningLayers,
  };

  const newPolicy = policyEngine.applyOverrides(myPolicy, inputs, []);

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
