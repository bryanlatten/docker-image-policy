[![Build Status](https://travis-ci.org/bryanlatten/docker-image-policy.svg?branch=master)](https://travis-ci.org/bryanlatten/docker-image-policy)
[![Docker Pulls](https://img.shields.io/docker/pulls/bryanlatten/docker-image-policy.svg?maxAge=2592000)]()

# docker-image-policy
Quick validation of an inspected Docker image according to a policy file


### Usage

- Uses pre-built containers on Docker Hub
- Uses default [policy](https://github.com/bryanlatten/docker-image-policy/blob/master/default_policy.yaml)
- NOTE: `docker inspect` expects the image to be stored locally, run `docker pull {target_image}` if not yet local

Pipe a target image's Docker-inspected output into container's stdin

```
$ docker pull ubuntu:18.04
$ docker inspect ubuntu:18.04 | docker run -i bryanlatten/docker-image-policy
```

##### Passing Run, using default policy
```
docker inspect ubuntu:18.04 | docker run -i bryanlatten/docker-image-policy

Scanning <8672b25e842c4c36f9f75d7edf48844ad32af57cf40596f5f236ed6462f073ba>
Docker Build: 17.03.0-ce
Parent:

Using policy <./default_policy.yaml>

[PASS] labels validated
[PASS] env keys validated
[PASS] volumes not allowed, none defined
[PASS] exposed ports allowed, none detected
[PASS] no exposed ports for range check [1025-65535]
[WARN] 697MB container size, recommend < 500MB
[PASS] no healthcheck specified
[PASS] 8 filesystem layers, maximum: 100

Status [PASS]
```

##### Failing Run, using default policy

```
docker inspect failingImageTag:v1 | docker run -i bryanlatten/docker-image-policy

Scanning <sha256:4612b98d0345171da30a0318faa9d1b05da7c8cb1440d5f5d2e5f032f49908c0>
Docker Build: 17.03.0-ce
Parent: sha256:905312a465bdd005beb8d6c319f1170e391d9c9f0da8d4da60d7eccc16b56661

Using policy <./default_policy.yaml>

[PASS] 4MB within 1500MB container size limit
[FAIL] disallowed labels present:
  - com.swipely.iam-docker.iam-profile
[FAIL] disallowed env keys present:
  - IAM_ROLE
[PASS] volumes not allowed, none defined
[FAIL] exposed port(s) required
[PASS] no healthcheck specified
[PASS] 3 filesystem layers, maximum: 100

Status [FAIL]
```

### Policy

A YAML file to describe specific policies to validate for the given docker image

Supported rules:
- Restrict `LABEL` usage by name
```
labels:
  disallow:
  -  com.swipely.iam-docker.iam-profile
```
- Restrict `ENV` usage by name
```
env_keys:
  disallow:
  - IAM_ROLE
```
- Restrict `EXPOSE` ports ranges, and/or require to comply to a range
```
ports:
  required: true
  range: '8080-99999'
```

- Restrict `VOLUME` usage
```
volumes:
  disallowed: true
```

- Restrict maximum container size
```
size:
  # In MB
  max: 1500
  warning: 1000
```

- Restrict health check usage
```
healthcheck:
  # Causes contention between orchestrator and Docker engine health status
  disallowed: true;
```

- Restrict maximum number of filesystem layers
```
layers:
  max: 100
  warning: 20
```

### Local Development

1. Pre-reqs: nodejs (8.0+), npm (5.0+), docker
1. Clone repo
1. `npm i`
1. Pipe Docker's `inspect` output into app
```docker inspect {target_image} | node index.js```

### Testing

- After local installation, running `npm test` in working directory

### Local Development: Docker

1. Clone repo
1. `docker build -t imagepolicy .`
1. ```docker inspect {target_image} | docker run -i imagepolicy```


