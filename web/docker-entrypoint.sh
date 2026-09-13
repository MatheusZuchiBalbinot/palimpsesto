#!/bin/sh
# fholzer/nginx-brotli (unlike the official nginx image this replaced) has
# no /docker-entrypoint.d/ scripts to run envsubst on nginx.conf.template
# automatically — this replicates just that one step ourselves, so
# API_PROXY_TARGET substitution keeps working the same way it did before.
set -e

envsubst '${API_PROXY_TARGET}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
