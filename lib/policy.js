module.exports = function() {

  return {

    emptyPolicy: function() {

      return {
          size: {},
          labels: {},
          env_keys: {},
          volumes: {},
          ports: {},
          healthcheck: {}
      };

    }, // emptyPolicy

    // Convenience function to list out all test functions
    enumerateTests: function() {

      return [
        'validateLabels',
        'validateEnvKeys',
        'validateVolumes',
        'validatePortRequirement',
        'validatePortRange',
        'validateContainerSize',
        'validateHealthCheck',
        'validateLayerCount'
      ];

    }, // enumerateTests

    // Override pieces of policy with specialized inputs
    applyOverrides: function(existingPolicy, inputs, msgs) {

      var availableOverrides = ['max', 'warning', 'labels', 'envs', 'range', 'layers_max', 'layers_warning'];
      var overrides = {};
      var policy = this.emptyPolicy();

      // NOTE: deep copy is necessary to prevent object reference copies
      var existingClone = JSON.parse(JSON.stringify(existingPolicy));
      Object.assign(policy, existingClone);

      // Filter out null values
      availableOverrides.forEach(function(item) {
        if (inputs[item]) {
          overrides[item] = inputs[item];
        }
      });

      policy.layers = policy.layers || {};

      this._checkOverridePolicy(overrides.max, policy.size, 'max', 'max image size', msgs);
      this._checkOverridePolicy(overrides.warning, policy.size, 'warning', 'warning image size', msgs);
      this._checkOverridePolicy(overrides.range, policy.ports, 'range', 'port range', msgs);
      this._checkOverridePolicy(overrides.layers_max, policy.layers, 'max', 'max layer count', msgs);
      this._checkOverridePolicy(overrides.layers_warning, policy.layers, 'warning', 'warning layer count', msgs);

      this._checkOverrideSplitPolicy(overrides.labels, policy.labels, 'labels', msgs);
      this._checkOverrideSplitPolicy(overrides.envs, policy.env_keys, 'env keys', msgs);

      return policy;

    }, // applyOverrides

    // Convenience function to run all included tests
    execute: function(policy, input) {

      var msgs = this.msgs(); // Holds all validation messages and their severities
      var passing = true;
      var that = this;

      this.enumerateTests().forEach(function(test) {
        var result = that[test](policy, input, msgs);
        passing = passing && result;
      });

      return {
        isPassing: function() {
          return passing;
        },
        getMessages: function() {
          return msgs.messages;
        }
      };

    }, // execute

    validateLabels: function(policy, input, msgs) {

      var labels = this._getObjectPropertyKeys(input.Config, 'Labels');

      var disallowedLabels = (policy.labels)
        ? policy.labels.disallow
        : [];

      var failedLabels = [];

      labels.forEach(function(element) {
        if (disallowedLabels.indexOf(element) !== -1) {
          failedLabels.push(element);
        }
      });

      var success = (failedLabels.length === 0 );

      if (success) {
        msgs.addSuccess('labels validated');
      } else {
        msgs.addFailure('disallowed labels present: ' + failedLabels.join(', '));
      }

      return success;

    }, // validateLabels

    validateEnvKeys: function(policy, input, msgs) {

      var disallowedEnvKeys = (policy.env_keys)
        ? policy.env_keys.disallow
        : [];

      var envKeys = [];
      var envsShell = (input.Config && input.Config.Env)
        ? input.Config.Env
        : [];

      var failedEnvKeys = [];

      // Environment variables are in shell syntax (key=value), and need to be extracted
      envsShell.forEach(function callback(value) {
        var element = value.split('=')[0];
        envKeys.push(element);
      });

      envKeys.forEach(function(element) {
        if (disallowedEnvKeys.indexOf(element) !== -1) {
          failedEnvKeys.push(element);
        }
      });

      var success = (failedEnvKeys.length === 0 );
      if (success) {
        msgs.addSuccess('env keys validated');
      } else {
        msgs.addFailure('disallowed env keys present: ' + failedEnvKeys.join(', '));
      }

      return success;

    }, // validateEnvKeys

    validateVolumes: function(policy, input, msgs) {

      var volumes = this._getObjectPropertyKeys(input.Config, 'Volumes');

      // Currently only a simple flag on or off
      var disallowedVolumes = (policy.volumes)
        ? !!policy.volumes.disallowed
        : false;

      var hasVolumes = (volumes.length > 0);
      var failed = (disallowedVolumes && volumes.length);

      if (failed) {
        msgs.addFailure('volumes are disallowed: ' + volumes.join(', '));
        return false;
      }

      var msg = "volumes ";

      if (disallowedVolumes) {
        msg += "not allowed, none defined";
      } else if (hasVolumes) {
        msg += "allowed: " + volumes.join(', ');
      } else {
        msg += "not in use";
      }

      msgs.addSuccess(msg);

      return true;

    }, // validateVolumes

    validatePortRequirement: function(policy, input, msgs) {

      var portsRequired = (policy.ports)
        ? !!policy.ports.required
        : false;

      var ports = this._getObjectPropertyKeys(input.ContainerConfig, 'ExposedPorts');
      var portsAvailable = (ports.length > 0);

      if (portsRequired) {

        if (!portsAvailable) {
          msgs.addFailure('exposed port(s) required');
          return false;
        }

        msgs.addSuccess('exposed ports required, detected');
        return true;

      } // if portsRequired

      if (portsAvailable) {
        msgs.addSuccess('exposed ports allowed, detected');
      } else {
        msgs.addSuccess('exposed ports allowed, none detected');
      }
      return true

    }, // validatePortRequirement

    validatePortRange: function(policy, input, msgs) {

      var portsRange = (policy.ports)
        ? policy.ports.range
        : null;

      if (!portsRange) {
        return true;
      }

      var ports = this._getObjectPropertyKeys(input.ContainerConfig, 'ExposedPorts');
      var split = portsRange.split('-');
      var lowerRange = parseInt(split[0], 10);
      var upperRange = parseInt(split[1], 10);

      if (upperRange < lowerRange) {
        msgs.addException('invalid port range specified: ' + lowerRange + '-' + upperRange);
        return false;
      }

      var failedPorts = [];
      var portNumbers = [];

      // Do not enforce port requirement from here, instead, using port: required policy
      if (!ports.length) {
        msgs.addSuccess('no exposed ports for range check [' + portsRange + ']');
        return true;
      }

      ports.forEach(function(element) {

        var portNumber = element.split('/')[0];
        portNumbers.push(portNumber);

        if (portNumber < lowerRange || portNumber > upperRange) {
          failedPorts.push(portNumber);
        }

      });

      var failed = (failedPorts.length > 0);

      if (!failed) {
        msgs.addSuccess('ports ' + portNumbers.join(', ') + ' within range [' + portsRange + ']');
        return true;
      }

      var msg = ' ' + failedPorts.join(', ') + ' outside of required range [' +  portsRange + ']';
      msg = ((failedPorts.length > 1) ? 'ports' : 'port') + msg;

      msgs.addFailure(msg);

      return !failed;

    }, // validatePortRange

    validateContainerSize: function(policy, input, msgs) {

      var maxSize = (policy.size && policy.size.max)
        ? parseInt(policy.size.max, 10)
        : null;

      var warningSize = (policy.size && policy.size.warning)
        ? parseInt(policy.size.warning, 10)
        : null;

      if (warningSize && maxSize && warningSize >= maxSize) {
        msgs.addException('Invalid policy: warning size (' + warningSize + 'MB) must be less max size (' + maxSize + 'MB)');
        return false;
      }

      // NOTE: this is reported in B, convert to MB
      var containerSize = Math.ceil(input.Size / 1000000);

      var failedWarningSize = (warningSize && containerSize >= warningSize);

      if (!maxSize) {

        if (failedWarningSize) {
          msgs.addWarning(containerSize + "MB container size, recommend < " + warningSize + "MB");
        }
        else {
          msgs.addSuccess('no max container size limit specified');
        }

        return true;

      } // if !maxSize

      if (containerSize > maxSize) {
        msgs.addFailure(containerSize + 'MB container size, exceeded ' + maxSize + 'MB maximum');
        return false;
      }

      if (failedWarningSize) {
        msgs.addWarning(containerSize + 'MB container size, recommend < ' + warningSize + 'MB');
      }
      else {
        msgs.addSuccess(containerSize + "MB container size, maximum: " + maxSize + "MB");
      }

      return true;

    }, // validateContainerSize

    validateHealthCheck: function(policy, input, msgs) {

      var isDisallowed = (policy.healthcheck)
        ? !!policy.healthcheck.disallowed
        : false;

      var healthcheck = (input.ContainerConfig && input.ContainerConfig.Healthcheck)
        ? input.ContainerConfig.Healthcheck
        : null;

      // Dockerfile spec outlines a "none" option
      var healthTest = (healthcheck && healthcheck.Test && Array.isArray(healthcheck.Test))
        ? healthcheck.Test
        : null;

      var noneSpecified = (healthTest && healthTest[0].toLowerCase() === 'none');
      var noCheck = (!healthcheck || noneSpecified);

      if (noCheck) {
        msgs.addSuccess('no healthcheck specified');
        return true;
      }

      if (isDisallowed) {
        msgs.addFailure('healthcheck is disallowed');
        return false;
      }

      msgs.addSuccess('healthcheck specified, allowed')
      return true;

    }, // validateHealthCheck

    validateLayerCount: function(policy, input, msgs) {

      var maxCount = (policy.layers && policy.layers.max)
        ? parseInt(policy.layers.max, 10)
        : null;

      var warningCount = (policy.layers && policy.layers.warning)
        ? parseInt(policy.layers.warning, 10)
        : null;

      if (warningCount && maxCount && warningCount >= maxCount) {
        msgs.addException('Invalid policy: layer count warning (' + warningCount + ') must be less max count (' + maxCount + ')');
        return false;
      }

      var layers = (input.RootFS)
                   ? input.RootFS.Layers
                   : [];

      var layerCount = layers.length;
      var failedWarningCount = (warningCount && layerCount >= warningCount);

      if (!maxCount) {

        if (failedWarningCount) {
          msgs.addWarning(layerCount + " filesystem layers, recommended < " + warningCount);
        }
        else {
          msgs.addSuccess('no maximum container layer count specified');
        }

        return true;

      } // if !maxCount

      if (layerCount > maxCount) {
        msgs.addFailure(layerCount + ' filesystem layers, maxmimum: ' + maxCount );
        return false;
      }

      if (failedWarningCount) {
        msgs.addWarning(layerCount + ' filesystem layers, recommended < ' + warningCount);
      }
      else {
        msgs.addSuccess(layerCount + " filesystem layers, maximum: " + maxCount);
      }

      return true;
    }, // validateLayerCount

    // Produces a container to hold ordered messages and their severities
    msgs: function() {
      return {
        messages: [],
        addSuccess: function(message) {
          this.messages.push(['success',message]);
        },
        addFailure: function(message) {
          this.messages.push(['failure',message]);
        },
        addWarning: function(message) {
          this.messages.push(['warning',message]);
        },
        addException: function(message) {
          this.messages.push(['exception',message]);
        }
      };
    },

    _checkOverridePolicy: function(override, destination, property, title, msgs) {

      if (!override) {
        return;
      }

      destination[property] = override;

      msgs.push(title + ': ' + override);

    }, // _checkOverridePolicy

    _checkOverrideSplitPolicy: function(override, destination, title, msgs) {

      if (!override) {
        return;
      }

      var addedValues = override.split(',');
      destination.disallow = addedValues;
      msgs.push('disallowed ' + title + ': ' + addedValues.join(', '));

    }, // _checkOverrideSplitPolicy

    // Returns empty array when property is non-existant
    _getObjectPropertyKeys: function(target, property) {

      return (target && target[property] )
        ? Object.keys(target[property])
        : [];

    } // _getObjectPropertyKeys
  };
};
