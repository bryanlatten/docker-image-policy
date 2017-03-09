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

### Usage

- Uses pre-built containers on Docker Hub
- Uses default [policy](https://github.com/bryanlatten/docker-image-policy/blob/master/default_policy.yaml)


```docker inspect {target_image} | docker run -i bryanlatten/docker-image-policy```


##### Failing Run, using default policy
```
docker inspect 359039b8c10c | node index.js

Scanning <sha256:359039b8c10c75b199f9b100194e8d26731dc86727b06d082d036566690180e6>
Docker Build: 17.03.0-ce
Parent: sha256:467eaeabe97cbb91654288348a36f359989a8d520ebb23167fdf4b0fe20125a0

Using policy <./default_policy.yaml>

[FAIL] disallowed labels present:
  - com.swipely.iam-docker.iam-profile
[FAIL] disallowed env keys present:
  - IAM_ROLE
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

[PASS] labels validated
[PASS] env keys validated

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
