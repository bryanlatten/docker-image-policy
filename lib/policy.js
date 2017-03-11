module.exports = function(policy, input) {

  var policy = policy;
  var input = input;

  return {
    successMsgs: [],
    failureMsgs: [],
    warningMsgs: [],
    exceptionMsgs: [],

    execute: function() {

      var passed =
        this.validateLabels() &
        this.validateEnvKeys() &
        this.validateVolumes() &
        this.validatePortRequirement() &
        this.validatePortRange() &
        this.validateContainerSize();

      return passed;

    }, // execute

    validateLabels: function() {

      var labels = (input.Config.Labels)
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
        this.successMsgs.push("labels validated");
      } else {
        this.failureMsgs.push("disallowed labels present: " + failedLabels.join(', '));
      }

      return success;

    }, // validateLabels

    validateEnvKeys: function() {

      var disallowedEnvKeys = (policy.env_keys)
        ? policy.env_keys.disallow
        : [];

      var envKeys = [];
      var envsShell = (input.Config.Env)
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
        this.successMsgs.push("env keys validated");
      } else {
        this.failureMsgs.push("disallowed env keys present: " + failedEnvKeys.join(', '));
      }

      return success;

    }, // validateEnvKeys

    validateVolumes: function() {

      var volumes = (input.Config.Volumes)
        ? Object.keys(input.Config.Volumes)
        : [];

      // Currently only a simple flag on or off
      var disallowedVolumes = (policy.volumes)
        ? !!policy.volumes.disallowed
        : false;

      var hasVolumes = (volumes.length > 0);
      var failed = (disallowedVolumes && volumes.length);

      if (failed) {
        this.failureMsgs.push("volumes are disallowed: " + volumes.join(', '));
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

      this.successMsgs.push(msg);

      return true;

    }, // validateVolumes

    validatePortRequirement: function() {

      var portsRequired = (policy.ports)
        ? !!policy.ports.required
        : false;

      var ports = (input.ContainerConfig.ExposedPorts)
        ? Object.keys(input.ContainerConfig.ExposedPorts)
        : [];

      var portsAvailable = (ports.length > 0);

      var success = (!portsRequired || portsAvailable);

      if (success) {
        this.successMsgs.push('exposed ports allowed: ' + ports.join(', '));
        return true;
      }

      if (portsRequired && !portsAvailable) {
        this.failureMsgs.push("exposed port(s) required");
      } else {
        this.successMsgs.push('no ports in use');
      }
      return false;

    }, // validatePortRequirement

    validatePortRange: function() {

      var portsRange = (policy.ports)
        ? policy.ports.range
        : null;

      if (!portsRange) {
        return true;
      }

      var ports = (input.ContainerConfig.ExposedPorts)
        ? Object.keys(input.ContainerConfig.ExposedPorts)
        : [];

      var split = portsRange.split('-');
      var lowerRange = parseInt(split[0]);
      var upperRange = parseInt(split[1]);

      if (upperRange < lowerRange) {
        this.exceptionMsgs.push('invalid port range specified: ' + lowerRange + '-' + upperRange);
        return false;
      }

      var _this = this;
      var failedPorts = [];
      var portNumbers = [];


      failedPortRange = ports.forEach(function(element) {

        var portNumber = element.split('/')[0];
        portNumbers.push(portNumber);

        if (portNumber < lowerRange || portNumber > upperRange) {
          failedPorts.push(portNumber);
        }

      });

      var failed = (failedPorts.length > 0);

      if (!failed) {
        _this.successMsgs.push('ports ' + portNumbers.join(', ') + ' within range [' + portsRange + ']');
        return true;
      }

      var msg = ' ' + failedPorts.join(', ') + ' outside of required range [' +  portsRange + ']';
      msg = ((failedPorts.length > 1) ? 'ports' : 'port') + msg;

      _this.failureMsgs.push(msg);

      return !failed;

    }, // validatePortRange

    validateContainerSize: function() {

      var maxSize = (policy.size)
        ? policy.size.max
        : null;

      var warningSize = (policy.size)
        ? policy.size.warning
        : null;

      var failedMaxSize = false;
      var failedWarningSize = false;

      // NOTE: this is reported in B, convert to MB
      var containerSize = Math.ceil(input.Size / 1000000);

      failedWarningSize = (warningSize !== null && containerSize >= warningSize);

      if (maxSize === null ) {

        if (failedWarningSize) {
          this.warningMsgs.push(containerSize + "MB container size should be below " + warningSize + "MB");
        }
        else {
          this.successMsgs.push("no max container size limit specified");
        }

      } else {

        if (containerSize > maxSize) {
          failedMaxSize = true;
          this.failureMsgs.push(containerSize + "MB exceeded " + maxSize + "MB max container size limit");
        } else {

          if (failedWarningSize) {
            this.warningMsgs.push(containerSize + "MB container size should be below " + warningSize + "MB");
          }
          else {
            this.successMsgs.push(containerSize + "MB within " + maxSize + "MB max container size limit");
          }
        }

      }  // else maxSize

      return failedMaxSize;

    } // validateContainerSize

  };

};
