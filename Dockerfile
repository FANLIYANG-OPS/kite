FROM fdc541c5ff5ec1812f6f5c02a1b787e1.d.1ms.run/library/node:20-alpine AS frontend-builder

WORKDIR /app/ui

COPY ui/package.json ui/pnpm-lock.yaml ./

RUN npm install -g pnpm && \
    pnpm install --frozen-lockfile

COPY ui/ ./
RUN pnpm run build

FROM fdc541c5ff5ec1812f6f5c02a1b787e1.d.1ms.run/library/golang:1.25-alpine AS backend-builder

WORKDIR /app

COPY go.mod ./
COPY go.sum ./

ENV GOPROXY=https://goproxy.cn,direct

RUN go mod download

COPY . .

COPY --from=frontend-builder /app/static ./static
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o kite .

FROM fdc541c5ff5ec1812f6f5c02a1b787e1.d.1ms.run/library/busybox:latest

WORKDIR /app

COPY --from=backend-builder /app/kite .

EXPOSE 8080

CMD ["./kite"]
