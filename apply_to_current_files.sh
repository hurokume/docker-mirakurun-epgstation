#!/bin/sh
set -eu

# Resolve paths relative to this script, even when called from another directory.
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$project_dir"

file_pairs() {
    cat <<'FILES'
docker-compose-sample.yml docker-compose.yml
epgstation/config/config.yml.template epgstation/config/config.yml
epgstation/config/enc.js.template epgstation/config/enc.js
epgstation/config/operatorLogConfig.sample.yml epgstation/config/operatorLogConfig.yml
epgstation/config/epgUpdaterLogConfig.sample.yml epgstation/config/epgUpdaterLogConfig.yml
epgstation/config/serviceLogConfig.sample.yml epgstation/config/serviceLogConfig.yml
FILES
}

fail() {
    printf 'ERROR: %s\n' "$*" >&2
    exit 1
}

# Check every source and destination before backing up or overwriting anything.
file_pairs | while read -r source destination; do
    [ -f "$source" ] && [ -r "$source" ] || fail "Cannot read template: $source"
    [ ! -L "$destination" ] || fail "Destination is a symbolic link: $destination"
    if [ -e "$destination" ]; then
        [ -f "$destination" ] || fail "Destination is not a regular file: $destination"
        [ -r "$destination" ] && [ -w "$destination" ] || fail "Cannot read/write: $destination"
    else
        [ -w "$(dirname -- "$destination")" ] || fail "Cannot create: $destination"
    fi
done

backup_root="$project_dir/config-backups"
[ ! -L "$backup_root" ] || fail "Backup directory is a symbolic link: $backup_root"
mkdir -p -- "$backup_root"
# Backups may contain database credentials. Each run gets a private directory.
backup_dir=$(umask 077; mktemp -d "$backup_root/$(date '+%Y%m%d-%H%M%S').XXXXXX")
printf 'Backup: %s\n' "$backup_dir"

# Finish all backups before the first overwrite. Keep the original permissions.
file_pairs | while read -r source destination; do
    if [ -f "$destination" ]; then
        mkdir -p -- "$backup_dir/$(dirname -- "$destination")"
        cp -p -- "$destination" "$backup_dir/$destination"
    fi
done

file_pairs | while read -r source destination; do
    cp -- "$source" "$destination"
    printf 'Updated: %s <- %s\n' "$destination" "$source"
done

printf '\nConfiguration updated. Apply it when recording/encoding is idle:\n'
printf '  sudo docker compose up -d --build mirakurun\n'
printf '  sudo docker compose up -d --force-recreate epgstation samba\n'
