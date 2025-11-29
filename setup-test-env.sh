#!/bin/bash
# Setup environment variables for testing

# Add test feature flags to .env.local
cat >> .env.local << EOF

# Feature Flags for Testing
NEXT_PUBLIC_ENABLE_AWS_S3_STORAGE=true
NEXT_PUBLIC_ENABLE_AWS_SES_EMAIL=false
NEXT_PUBLIC_ENABLE_TWILIO_SMS=true
NEXT_PUBLIC_ENABLE_TWILIO_CHAT=true
NEXT_PUBLIC_ENABLE_STRIPE_SUBSCRIPTIONS=true
NEXT_PUBLIC_ENABLE_ZOOM_TELEHEALTH=true
EOF

echo "✅ Test environment variables added to .env.local"
echo "Please restart the development server for changes to take effect."
