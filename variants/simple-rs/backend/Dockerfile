FROM rust:1.96-bookworm AS builder

WORKDIR /app

COPY Cargo.toml ./
COPY Cargo.lock ./
COPY src ./src

RUN cargo build --release

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/simple-rs-backend /usr/local/bin/simple-rs-backend

EXPOSE 80

CMD ["simple-rs-backend"]
