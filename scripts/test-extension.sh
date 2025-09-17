#!/bin/bash

# Test extension script with comprehensive error handling
set -e

EXTENSION_NAME=${1:-"test-extension"}
EXTENSION_TYPE=${2:-"podman_python"}
TEST_DATA=${3:-"test input"}

echo "🧪 Testing extension: $EXTENSION_NAME (type: $EXTENSION_TYPE)"

# Clean up any existing processes
echo "🧹 Cleaning up existing processes..."
pkill -f "goosed" 2>/dev/null || true
sleep 2

# Start the server
echo "🚀 Starting Goose server..."
GOOSE__SERVER__HOST=127.0.0.1 GOOSE__SERVER__PORT=51998 ./target/release/goosed agent &
SERVER_PID=$!

# Wait for server to start
echo "⏳ Waiting for server to start..."
for i in {1..30}; do
    if curl -s http://127.0.0.1:51998/health >/dev/null 2>&1; then
        echo "✅ Server is running"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "❌ Server failed to start"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
    sleep 1
done

# Test extension creation
echo "🔧 Testing extension creation..."

# Create a simple test extension
cat > /tmp/test_extension.json << EOF
{
  "type": "$EXTENSION_TYPE",
  "name": "$EXTENSION_NAME",
  "description": "Test extension for validation",
  "code": "import json\nimport sys\n\ndef process_input(data):\n    return {\"result\": f\"Processed: {data}\", \"status\": \"success\"}\n\nif __name__ == \"__main__\":\n    try:\n        input_data = sys.argv[1] if len(sys.argv) > 1 else \"default\"\n        result = process_input(input_data)\n        print(json.dumps(result))\n    except Exception as e:\n        print(json.dumps({\"error\": str(e)}))",
  "dependencies": ["pandas"],
  "timeout": 30
}
EOF

# Add the extension
echo "📝 Adding extension..."
RESPONSE=$(curl -s -X POST http://127.0.0.1:51998/extensions \
    -H "Content-Type: application/json" \
    -d @/tmp/test_extension.json)

echo "Response: $RESPONSE"

# Check if extension was added successfully
if echo "$RESPONSE" | grep -q '"error":false'; then
    echo "✅ Extension added successfully"
else
    echo "❌ Failed to add extension"
    echo "Error details: $RESPONSE"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

# Test extension execution
echo "⚡ Testing extension execution..."
EXECUTION_RESPONSE=$(curl -s -X POST http://127.0.0.1:51998/extensions/$EXTENSION_NAME/execute \
    -H "Content-Type: application/json" \
    -d "{\"input\": \"$TEST_DATA\"}")

echo "Execution response: $EXECUTION_RESPONSE"

# Clean up
echo "🧹 Cleaning up..."
kill $SERVER_PID 2>/dev/null || true
rm -f /tmp/test_extension.json

echo "✅ Extension test completed"
