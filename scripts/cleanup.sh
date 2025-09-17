#!/bin/bash

# Cleanup script to kill any leftover Goose processes
echo "🧹 Cleaning up leftover Goose processes..."

# Kill goosed processes
pkill -f "goosed agent" 2>/dev/null || true
pkill -f "goosed mcp" 2>/dev/null || true
pkill -f "goose" 2>/dev/null || true

# Kill any processes listening on common Goose ports
for port in 3000 51998 8080; do
    pid=$(lsof -ti:$port 2>/dev/null || true)
    if [ ! -z "$pid" ]; then
        echo "Killing process $pid on port $port"
        kill -9 $pid 2>/dev/null || true
    fi
done

# Wait a moment for processes to die
sleep 1

# Check if any are still running
remaining=$(pgrep -f "goosed\|goose" 2>/dev/null || true)
if [ ! -z "$remaining" ]; then
    echo "⚠️  Some processes still running, force killing..."
    pkill -9 -f "goosed\|goose" 2>/dev/null || true
fi

echo "✅ Cleanup complete"
