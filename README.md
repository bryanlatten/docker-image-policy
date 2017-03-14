[![Build Status](https://travis-ci.org/bryanlatten/docker-image-policy.svg?branch=master)](https://travis-ci.org/bryanlatten/docker-image-policy)

# docker-image-policy
Quick validation of an inspected Docker image according to a policy file

### Pre-reqs
- nodejs (7.6+)
- npm (4.1+)
- docker

### Local Development

1. Clone repo
1. `npm i`
1. Pipe Docker's `inspect` output into app
```docker inspect {target_image} | node index.js```

### Local Development: Docker

1. Clone repo
1. `docker build -t imagepolicy .`
1. ```docker inspect {target_image} | docker run -i imagepolicy```

### Testing 

- After local installation, running `npm test` in working directory

### Usage

- Uses pre-built containers on Docker Hub
- Uses default [policy](https://github.com/bryanlatten/docker-image-policy/blob/master/default_policy.yaml)


```docker inspect {target_image} | docker run -i bryanlatten/docker-image-policy```

##### Failing Run, using default policy
```
docker inspect 359039b8c10c | node index.js

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

Status [FAIL]
```

##### Passing Run, using default policy
```
docker inspect d183d547d7ab | node index.js

Scanning <sha256:d183d547d7abcb0d68f9ed4598963120a4e82d4105bcdf4585f6ef553400f913>
Docker Build: 1.12.6-cs6
Parent:

Using policy <./default_policy.yaml>

[PASS] 370MB within 1500MB container size limit
[PASS] labels validated
[PASS] env keys validated
[PASS] volumes not allowed, none defined

Status [PASS]
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
