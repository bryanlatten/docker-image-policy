const policyEngine = {
  emptyPolicy: () => (
    {
      size: {},
      labels: {},
      env_keys: {},
      volumes: {},
      ports: {},
      healthcheck: {},
    }
  ),

  // Convenience function to list out all test functions
  enumerateTests() {
    return [
      'validateLabels',
      'validateEnvKeys',
      'validateVolumes',
      'validatePortRequirement',
      'validatePortRange',
      'validateContainerSize',
      'validateHealthCheck',
      'validateLayerCount',
    ];
  }, // enumerateTests

  // Override pieces of policy with specialized inputs
  applyOverrides(existingPolicy, inputs, msgs) {
    const availableOverrides = ['max', 'warning', 'labels', 'envs', 'range', 'layers_max', 'layers_warning'];
    const overrides = {};
    const policy = policyEngine.emptyPolicy();

    // NOTE: deep copy is necessary to prevent object reference copies
    const existingClone = JSON.parse(JSON.stringify(existingPolicy));
    Object.assign(policy, existingClone);

    // Filter out null values
    availableOverrides.forEach((item) => {
      if (inputs[item]) {
        overrides[item] = inputs[item];
      }
    });

    policy.layers = policy.layers || {};

    policyEngine.checkOrOverridePolicy(overrides.max, policy.size, 'max', 'max image size', msgs);
    policyEngine.checkOrOverridePolicy(overrides.warning, policy.size, 'warning', 'warning image size', msgs);
    policyEngine.checkOrOverridePolicy(overrides.range, policy.ports, 'range', 'port range', msgs);
    policyEngine.checkOrOverridePolicy(overrides.layers_max, policy.layers, 'max', 'max layer count', msgs);
    policyEngine.checkOrOverridePolicy(overrides.layers_warning, policy.layers, 'warning', 'warning layer count', msgs);

    policyEngine.checkOrOverrideSplitPolicy(overrides.labels, policy.labels, 'labels', msgs);
    policyEngine.checkOrOverrideSplitPolicy(overrides.envs, policy.env_keys, 'env keys', msgs);

    return policy;
  },

  // Convenience function to run all included tests
  execute(policy, input) {
    const msgs = policyEngine.msgs(); // Holds all validation messages and their severities
    let passing = true;
    const that = this;

    policyEngine.enumerateTests().forEach((test) => {
      const result = that[test](policy, input, msgs);
      passing = passing && result;
    });

    return {
      isPassing: () => passing,
      getMessages: () => msgs.messages,
    };
  },

  validateLabels(policy, input, msgs) {
    const labels = policyEngine.getObjectPropertyKeys(input.Config, 'Labels');

    const disallowedLabels = (policy.labels)
      ? policy.labels.disallow
      : [];

    const failedLabels = [];

    labels.forEach((element) => {
      if (disallowedLabels.indexOf(element) !== -1) {
        failedLabels.push(element);
      }
    });

    const success = (failedLabels.length === 0);

    if (success) {
      msgs.addSuccess('labels validated');
    } else {
      msgs.addFailure(`disallowed labels present: ${failedLabels.join(', ')}`);
    }

    return success;
  },

  validateEnvKeys(policy, input, msgs) {
    const disallowedEnvKeys = (policy.env_keys)
      ? policy.env_keys.disallow
      : [];

    const envKeys = [];
    const envsShell = (input.Config && input.Config.Env)
      ? input.Config.Env
      : [];

    const failedEnvKeys = [];

    // Environment variables are in shell syntax (key=value), and need to be extracted
    envsShell.forEach((value) => {
      const element = value.split('=')[0];
      envKeys.push(element);
    });

    envKeys.forEach((element) => {
      if (disallowedEnvKeys.indexOf(element) !== -1) {
        failedEnvKeys.push(element);
      }
    });

    const success = (failedEnvKeys.length === 0);
    if (success) {
      msgs.addSuccess('env keys validated');
    } else {
      msgs.addFailure(`disallowed env keys present: ${failedEnvKeys.join(', ')}`);
    }

    return success;
  },

  validateVolumes(policy, input, msgs) {
    const volumes = policyEngine.getObjectPropertyKeys(input.Config, 'Volumes');

    // Currently only a simple flag on or off
    const disallowedVolumes = (policy.volumes)
      ? !!policy.volumes.disallowed
      : false;

    const hasVolumes = (volumes.length > 0);
    const failed = (disallowedVolumes && volumes.length);

    if (failed) {
      msgs.addFailure(`volumes are disallowed: ${volumes.join(', ')}`);
      return false;
    }

    let msg = 'volumes ';

    if (disallowedVolumes) {
      msg += 'not allowed, none defined';
    } else if (hasVolumes) {
      msg += `allowed: ${volumes.join(', ')}`;
    } else {
      msg += 'not in use';
    }

    msgs.addSuccess(msg);

    return true;
  },

  validatePortRequirement(policy, input, msgs) {
    const portsRequired = (policy.ports)
      ? !!policy.ports.required
      : false;

    const ports = policyEngine.getObjectPropertyKeys(input.ContainerConfig, 'ExposedPorts');
    const portsAvailable = (ports.length > 0);

    if (portsRequired) {
      if (!portsAvailable) {
        msgs.addFailure('exposed port(s) required');
        return false;
      }

      msgs.addSuccess('exposed ports required, detected');
      return true;
    }

    if (portsAvailable) {
      msgs.addSuccess('exposed ports allowed, detected');
    } else {
      msgs.addSuccess('exposed ports allowed, none detected');
    }
    return true;
  },

  validatePortRange(policy, input, msgs) {
    const portsRange = (policy.ports)
      ? policy.ports.range
      : null;

    if (!portsRange) {
      return true;
    }

    const ports = policyEngine.getObjectPropertyKeys(input.ContainerConfig, 'ExposedPorts');
    const split = portsRange.split('-');
    const lowerRange = parseInt(split[0], 10);
    const upperRange = parseInt(split[1], 10);

    if (upperRange < lowerRange) {
      msgs.addException(`invalid port range specified: ${lowerRange}-${upperRange}`);
      return false;
    }

    const failedPorts = [];
    const portNumbers = [];

    // Do not enforce port requirement from here, instead, using port: required policy
    if (!ports.length) {
      msgs.addSuccess(`no exposed ports for range check [${portsRange}]`);
      return true;
    }

    ports.forEach((element) => {
      const portNumber = element.split('/')[0];
      portNumbers.push(portNumber);

      if (portNumber < lowerRange || portNumber > upperRange) {
        failedPorts.push(portNumber);
      }
    });

    const failed = (failedPorts.length > 0);

    if (!failed) {
      msgs.addSuccess(`ports ${portNumbers.join(', ')} within range [${portsRange}]`);
      return true;
    }

    let msg = ` ${failedPorts.join(', ')} outside of required range [${portsRange}]`;
    msg = ((failedPorts.length > 1) ? 'ports' : 'port') + msg;

    msgs.addFailure(msg);

    return !failed;
  },

  validateContainerSize(policy, input, msgs) {
    const maxSize = (policy.size && policy.size.max)
      ? parseInt(policy.size.max, 10)
      : null;

    const warningSize = (policy.size && policy.size.warning)
      ? parseInt(policy.size.warning, 10)
      : null;

    if (warningSize && maxSize && warningSize >= maxSize) {
      msgs.addException(`Invalid policy: warning size (${warningSize}MB) must be less max size (${maxSize}MB)`);
      return false;
    }

    // NOTE: this is reported in B, convert to MB
    const containerSize = Math.ceil(input.Size / 1000000);

    const failedWarningSize = (warningSize && containerSize >= warningSize);

    if (!maxSize) {
      if (failedWarningSize) {
        msgs.addWarning(`${containerSize}MB container size, recommend < ${warningSize}MB`);
      } else {
        msgs.addSuccess('no max container size limit specified');
      }

      return true;
    } // if !maxSize

    if (containerSize > maxSize) {
      msgs.addFailure(`${containerSize}MB container size, exceeded ${maxSize}MB maximum`);
      return false;
    }

    if (failedWarningSize) {
      msgs.addWarning(`${containerSize}MB container size, recommend < ${warningSize}MB`);
    } else {
      msgs.addSuccess(`${containerSize}MB container size, maximum: ${maxSize}MB`);
    }

    return true;
  },

  validateHealthCheck(policy, input, msgs) {
    const isDisallowed = (policy.healthcheck)
      ? !!policy.healthcheck.disallowed
      : false;

    const healthcheck = (input.ContainerConfig && input.ContainerConfig.Healthcheck)
      ? input.ContainerConfig.Healthcheck
      : null;

    // Dockerfile spec outlines a "none" option
    const healthTest = (healthcheck && healthcheck.Test && Array.isArray(healthcheck.Test))
      ? healthcheck.Test
      : null;

    const noneSpecified = (healthTest && healthTest[0].toLowerCase() === 'none');
    const noCheck = (!healthcheck || noneSpecified);

    if (noCheck) {
      msgs.addSuccess('no healthcheck specified');
      return true;
    }

    if (isDisallowed) {
      msgs.addFailure('healthcheck is disallowed');
      return false;
    }

    msgs.addSuccess('healthcheck specified, allowed');
    return true;
  },

  validateLayerCount(policy, input, msgs) {
    const maxCount = (policy.layers && policy.layers.max)
      ? parseInt(policy.layers.max, 10)
      : null;

    const warningCount = (policy.layers && policy.layers.warning)
      ? parseInt(policy.layers.warning, 10)
      : null;

    if (warningCount && maxCount && warningCount >= maxCount) {
      msgs.addException(`Invalid policy: layer count warning (${warningCount}) must be less max count (${maxCount})`);
      return false;
    }

    const layers = (input.RootFS)
      ? input.RootFS.Layers
      : [];

    const layerCount = layers.length;
    const failedWarningCount = (warningCount && layerCount >= warningCount);

    if (!maxCount) {
      if (failedWarningCount) {
        msgs.addWarning(`${layerCount} filesystem layers, recommended < ${warningCount}`);
      } else {
        msgs.addSuccess('no maximum container layer count specified');
      }

      return true;
    } // if !maxCount

    if (layerCount > maxCount) {
      msgs.addFailure(`${layerCount} filesystem layers, maxmimum: ${maxCount}`);
      return false;
    }

    if (failedWarningCount) {
      msgs.addWarning(`${layerCount} filesystem layers, recommended < ${warningCount}`);
    } else {
      msgs.addSuccess(`${layerCount} filesystem layers, maximum: ${maxCount}`);
    }

    return true;
  },

  /**
   * Produces a container to hold ordered messages and their severities
   */
  msgs: () => (
    {
      messages: [],
      addSuccess(message) {
        this.messages.push(['success', message]);
      },
      addFailure(message) {
        this.messages.push(['failure', message]);
      },
      addWarning(message) {
        this.messages.push(['warning', message]);
      },
      addException(message) {
        this.messages.push(['exception', message]);
      },
    }
  ),

  checkOrOverridePolicy(override, destination, property, title, msgs) {
    if (!override) {
      return;
    }

    destination[property] = override; // eslint-disable-line no-param-reassign

    msgs.push(`${title}: ${override}`);
  },

  checkOrOverrideSplitPolicy(override, destination, title, msgs) {
    if (!override) {
      return;
    }

    const addedValues = override.split(',');
    destination.disallow = addedValues; // eslint-disable-line no-param-reassign

    msgs.push(`disallowed ${title}: ${addedValues.join(', ')}`);
  },

  /**
   * Returns empty array when property is non-existant
   */
  getObjectPropertyKeys(target, property) {
    return (target && target[property])
      ? Object.keys(target[property])
      : [];
  },
};

module.exports = policyEngine;
