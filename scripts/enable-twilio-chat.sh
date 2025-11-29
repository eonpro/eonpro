#!/bin/bash

# This script updates the .env.local file to enable Twilio Chat

ENV_FILE=".env.local"

# Check if .env.local exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ .env.local file not found. Creating from .env.example..."
    cp .env.example "$ENV_FILE"
fi

# Function to update or add environment variable
update_or_add_env() {
    KEY=$1
    VALUE=$2
    
    if grep -q "^$KEY=" "$ENV_FILE"; then
        # Update existing variable
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' "s/^$KEY=.*/$KEY=$VALUE/" "$ENV_FILE"
        else
            # Linux
            sed -i "s/^$KEY=.*/$KEY=$VALUE/" "$ENV_FILE"
        fi
        echo "✅ Updated $KEY=$VALUE"
    else
        # Add new variable
        echo "$KEY=$VALUE" >> "$ENV_FILE"
        echo "✅ Added $KEY=$VALUE"
    fi
}

echo "🔧 Enabling Twilio Chat feature..."

# Enable Twilio Chat
update_or_add_env "TWILIO_CHAT" "true"

# Ensure Twilio Chat configuration is set (using mock values for testing)
update_or_add_env "TWILIO_CHAT_SERVICE_SID" "IS_mock_chat_service_123456"
update_or_add_env "TWILIO_API_KEY" "SK_mock_api_key_123456" 
update_or_add_env "TWILIO_API_SECRET" "mock_api_secret_abcdef123456"

echo ""
echo "✨ Twilio Chat has been enabled!"
echo ""
echo "📝 Next steps:"
echo "1. Stop the development server (Ctrl+C)"
echo "2. Restart with: npm run dev"
echo "3. Navigate to: http://localhost:5000/communications/chat"
echo ""
echo "The Chat feature should now be active!"
