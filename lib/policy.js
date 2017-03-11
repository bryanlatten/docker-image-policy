module.exports = function() {

  return {

    // Convenience function to list out all test functions
    enumerateTests: function() {

      return [
        this.validateLabels,
        this.validateEnvKeys,
        this.validateVolumes,
        this.validatePortRequirement,
        this.validatePortRange,
        this.validateContainerSize,
      ];

    }, // enumerateTests

    // Convenience function to run all included tests
    execute: function(policy, input) {

      var msgs = this.msgs(); // Holds all validation messages and their severities
      var passing = true;

      this.enumerateTests().forEach(function(test) {
        var result = test(policy, input, msgs);
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

      var labels = (input.Config && input.Config.Labels)
        ? Object.keys(input.Config.Labels)
        : [];

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
      envsShell.forEach(function callback(value, index, array) {
        var element = value.split('=')[0];
        envKeys.push(element);
      });

      envKeys.forEach(function(element, index, array) {
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

      var volumes = (input.Config && input.Config.Volumes)
        ? Object.keys(input.Config.Volumes)
        : [];

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

      var ports = (input.ContainerConfig && input.ContainerConfig.ExposedPorts)
        ? Object.keys(input.ContainerConfig.ExposedPorts)
        : [];

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

      var ports = (input.ContainerConfig && input.ContainerConfig.ExposedPorts)
        ? Object.keys(input.ContainerConfig.ExposedPorts)
        : [];

      var split = portsRange.split('-');
      var lowerRange = parseInt(split[0]);
      var upperRange = parseInt(split[1]);

      if (upperRange < lowerRange) {
        msgs.addException('invalid port range specified: ' + lowerRange + '-' + upperRange);
        return false;
      }

      var _this = this;
      var failedPorts = [];
      var portNumbers = [];

      // Do not enforce port requirement from here, instead, using port: required policy
      if (!ports.length) {
        msgs.addSuccess('no exposed ports for range check [' + portsRange + ']');
        return true;
      }

      failedPortRange = ports.forEach(function(element) {

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
        ? parseInt(policy.size.max)
        : null;

      var warningSize = (policy.size && policy.size.warning)
        ? parseInt(policy.size.warning)
        : null;

      if (warningSize && maxSize && warningSize >= maxSize) {
        msgs.addException('Warning size (' + warningSize + 'MB) must be less max size (' + maxSize + 'MB)');
        return false;
      }

      // NOTE: this is reported in B, convert to MB
      var containerSize = Math.ceil(input.Size / 1000000);

      var failedWarningSize = (warningSize && containerSize >= warningSize);

      if (!maxSize) {

        if (failedWarningSize) {
          msgs.addWarning(containerSize + "MB container size should be below " + warningSize + "MB");
        }
        else {
          msgs.addSuccess('no max container size limit specified');
        }

        return true;

      } // if !maxSize

      if (containerSize > maxSize) {
        msgs.addFailure(containerSize + 'MB exceeded ' + maxSize + 'MB max container size limit');
        return false;
      }

      if (failedWarningSize) {
        msgs.addWarning(containerSize + 'MB container size should be below ' + warningSize + 'MB');
      }
      else {
        msgs.addSuccess(containerSize + "MB within " + maxSize + "MB max container size limit");
      }

      return true;

    }, // validateContainerSize

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
    }
  };
};
