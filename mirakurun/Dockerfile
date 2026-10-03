ARG MIRAKURUN_IMAGE=chinachu/mirakurun:4.1.5

FROM ${MIRAKURUN_IMAGE} AS recpt1-build
ARG RECPT1_COMMIT=77c7bce2527e1df45cc8667ede753d09de7b3e6c

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        autoconf automake build-essential ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

# Build only the userspace tools. px4_drv stays on the Linux host.
# B25 decoding is handled by Mirakurun's separate decoder command.
RUN git init /tmp/recpt1 && \
    git -C /tmp/recpt1 remote add origin https://github.com/stz2012/recpt1.git && \
    git -C /tmp/recpt1 fetch --depth 1 origin "${RECPT1_COMMIT}" && \
    git -C /tmp/recpt1 checkout --detach FETCH_HEAD && \
    cd /tmp/recpt1/recpt1 && \
    ./autogen.sh && \
    ./configure --prefix=/usr/local && \
    make -j2 && \
    mkdir -p /out/usr/local/bin && \
    make install DESTDIR=/out

FROM ${MIRAKURUN_IMAGE}
ARG ARIB_B25_VERSION=0.2.9

COPY --from=recpt1-build /out/usr/local/bin/ /usr/local/bin/

# The base image has the PC/SC headers and compiler needed by this package.
# Install now so container-init.sh finds it without downloading at startup.
RUN npm install --global --no-audit --no-fund --registry=https://registry.npmjs.org \
        --allow-scripts=arib-b25-stream-test \
        "arib-b25-stream-test@${ARIB_B25_VERSION}" && \
    npm cache clean --force && \
    recpt1 --version && \
    command -v arib-b25-stream-test
