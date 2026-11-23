# MinIO no longer publishes community images or binaries, so we build the pinned release from
# source (the same version Homebrew builds for local development without Docker).
ARG MINIO_RELEASE=RELEASE.2025-10-15T17-29-55Z
# Commit of that tag; the build fails if the tag ever points elsewhere.
ARG MINIO_COMMIT=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a

FROM golang:1.24-alpine AS build
ARG MINIO_RELEASE
ARG MINIO_COMMIT
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --filter=blob:none --no-checkout https://github.com/minio/minio.git . \
 && git checkout --quiet "${MINIO_COMMIT}" \
 && test "$(git rev-parse HEAD)" = "${MINIO_COMMIT}" \
 && test "$(git rev-parse "refs/tags/${MINIO_RELEASE}^{commit}")" = "${MINIO_COMMIT}" \
 && CGO_ENABLED=0 go build -trimpath -o /minio .

FROM alpine:3.22
RUN apk add --no-cache ca-certificates wget && adduser -D -u 10001 minio && mkdir /data && chown minio /data
COPY --from=build /minio /usr/local/bin/minio
USER minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
