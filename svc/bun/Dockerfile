FROM oven/bun:1.4.3-debian

USER root
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git \
  && case "$(dpkg --print-architecture)" in \
       amd64) watchexec_arch=x86_64 ;; \
       arm64) watchexec_arch=aarch64 ;; \
       *) echo 'Unsupported watchexec architecture' >&2; exit 1 ;; \
     esac \
  && curl -fL "https://github.com/watchexec/watchexec/releases/download/v2.8.0/watchexec-2.8.0-${watchexec_arch}-unknown-linux-musl.deb" -o /tmp/watchexec.deb \
  && apt-get install -y --no-install-recommends /tmp/watchexec.deb \
  && watchexec --version \
  && rm /tmp/watchexec.deb \
  && rm -rf /var/lib/apt/lists/*
