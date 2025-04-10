[![GitHub release](https://img.shields.io/github/release/step-security/ghaction-setup-containerd.svg?style=flat-square)](https://github.com/step-security/ghaction-setup-containerd/releases/latest)

## About

GitHub Action to set up [containerd](https://github.com/containerd/containerd).

___

* [Usage](#usage)
  * [Quick start](#quick-start)
  * [Pull Docker image](#pull-docker-image)
  * [Build and push Docker image](#build-and-push-docker-image)
* [Customizing](#customizing)
  * [inputs](#inputs)
* [Limitation](#limitation)
* [Contributing](#contributing)
* [License](#license)

## Usage

### Quick start

```yaml
name: containerd

on:
  push:

jobs:
  containerd:
    runs-on: ubuntu-latest
    steps:
      -
        name: Set up containerd
        uses: step-security/ghaction-setup-containerd@v3
```

### Pull Docker image

```yaml
name: containerd

on:
  push:

jobs:
  containerd:
    runs-on: ubuntu-latest
    steps:
      -
        name: Set up containerd
        uses: step-security/ghaction-setup-containerd@v3
      -
        name: Pull Docker image
        run: |
          sudo ctr i pull --all-platforms --all-metadata docker.io/library/hello-world:latest
```

### Build and push Docker image

```yaml
name: containerd

on:
  push:

jobs:
  containerd:
    runs-on: ubuntu-latest
    steps:
      -
        name: Checkout
        uses: actions/checkout@v4
      -
        name: Set up QEMU
        uses: docker/setup-qemu-action@v2
      -
        name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      -
        name: Set up containerd
        uses: step-security/ghaction-setup-containerd@v3
      -
        name: Build Docker image
        uses: docker/build-push-action@v4
        with:
          context: .
          file: ./Dockerfile
          platforms: linux/386,linux/amd64,linux/arm/v6,linux/arm/v7,linux/arm64,linux/ppc64le,linux/s390x
          tags: docker.io/${{ secrets.DOCKER_USERNAME }}/custom-image-test:latest
          outputs: type=oci,dest=/tmp/image.tar
      -
        name: Import image in containerd
        run: |
          sudo ctr i import --base-name docker.io/${{ secrets.DOCKER_USERNAME }}/diun --digests --all-platforms /tmp/image.tar
      -
        name: Push image with containerd
        run: |
          sudo ctr i push --user "${{ secrets.DOCKER_USERNAME }}:${{ secrets.DOCKER_PASSWORD }}" docker.io/${{ secrets.DOCKER_USERNAME }}/diun:latest
```

## Customizing

### inputs

The following inputs can be used as `step.with` keys

| Name                 | Type     | Default  | Description                                                                     |
|----------------------|----------|----------|---------------------------------------------------------------------------------|
| `containerd-version` | String   | `latest` | [containerd](https://github.com/containerd/containerd) version (e.g., `v1.4.1`) |
| `config`             | String   |          | Containerd config file                                                          |
| `config-inline`      | String   |          | Same as `config` but inline                                                     |

> `config` and `config-inline` are mutually exclusive.

## Limitation

This action is only available for Linux [virtual environments](https://help.github.com/en/articles/virtual-environments-for-github-actions#supported-virtual-environments-and-hardware-resources).

## License

MIT. See `LICENSE` for more details.
