#!/bin/bash

# Test server script with automatic cleanup
set -e

# Default values
PORT=${1:-51998}
HOST=${2:-127.0.0.1}

echo "🚀 Starting Goose server on $HOST:$PORT"
echo "Press Ctrl+C to stop and cleanup"

# Set up cleanup trap
cleanup() {
    echo ""
    echo "🛑 Stopping server and cleaning up..."
    pkill -f "goosed agent" 2>/dev/null || true
    sleep 1
    echo "✅ Cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start the server
GOOSE__SERVER__HOST=$HOST GOOSE__SERVER__PORT=$PORT ./target/release/goosed agent &

# Wait for the server to start
echo "⏳ Waiting for server to start..."
sleep 3

# Check if server is running
if lsof -i:$PORT >/dev/null 2>&1; then
    echo "✅ Server is running on $HOST:$PORT"
    echo "📡 Health check: $(curl -s http://$HOST:$PORT/health 2>/dev/null || echo "Failed")"
else
    echo "❌ Server failed to start on port $PORT"
    cleanup
    exit 1
fi

# Keep the script running and wait for interrupt
wait
