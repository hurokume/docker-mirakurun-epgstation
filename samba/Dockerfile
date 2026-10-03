FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends samba smbclient && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /run/samba /shares/Shared

COPY smb.conf /etc/samba/smb.conf
RUN testparm --suppress-prompt /etc/samba/smb.conf > /dev/null

EXPOSE 445

HEALTHCHECK --interval=60s --timeout=10s --start-period=10s --retries=3 \
    CMD smbclient //127.0.0.1/Shared -N -U '%' -c 'ls' > /dev/null 2>&1 || exit 1

CMD ["smbd", "--foreground", "--no-process-group", "--debug-stdout"]
