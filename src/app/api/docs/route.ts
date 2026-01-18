import { NextRequest, NextResponse } from 'next/server';

/**
 * API Documentation Endpoint
 * 
 * GET /api/docs - Returns API documentation summary
 */

export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.eonpro.io';
  
  return NextResponse.json({
    name: "EONPRO Healthcare Platform API",
    version: "2.0.0",
    description: "Enterprise healthcare platform for patient management, prescriptions, and telehealth",
    baseUrl: `${baseUrl}/api`,
    
    documentation: {
      webhookGuide: "https://github.com/eonpro/eonpro/blob/main/docs/WEBHOOK_INTEGRATION_GUIDE.md",
      apiReference: "https://github.com/eonpro/eonpro/blob/main/docs/API_REFERENCE.md",
      support: "support@eonpro.io",
    },
    
    authentication: {
      jwt: {
        description: "For web applications and user authentication",
        endpoint: "/api/auth/login",
        header: "Authorization: Bearer <token>",
      },
      webhook: {
        description: "For server-to-server webhook integrations",
        headers: [
          "x-webhook-secret: <secret>",
          "x-api-key: <secret>",
          "Authorization: Bearer <secret>",
        ],
      },
    },
    
    endpoints: {
      webhooks: {
        "POST /api/webhooks/weightlossintake": {
          description: "Receive patient intake form submissions",
          authentication: "webhook secret",
          rateLimit: "1000/minute",
          documentation: "/api/webhooks/test (GET for usage info)",
        },
        "POST /api/webhooks/test": {
          description: "Test webhook integration (no real patients created)",
          authentication: "webhook secret",
          rateLimit: "100/minute",
        },
        "GET /api/admin/webhook-status": {
          description: "Check recent webhook activity",
          authentication: "admin secret",
        },
      },
      
      patients: {
        "GET /api/patients": {
          description: "List all patients",
          authentication: "JWT",
          parameters: ["page", "limit", "search", "tags"],
        },
        "GET /api/patients/:id": {
          description: "Get patient by ID",
          authentication: "JWT",
        },
        "POST /api/patients": {
          description: "Create new patient",
          authentication: "JWT (admin/provider)",
        },
        "PUT /api/patients/:id": {
          description: "Update patient",
          authentication: "JWT (admin/provider)",
        },
      },
      
      documents: {
        "GET /api/patients/:id/documents": {
          description: "List patient documents",
          authentication: "JWT",
        },
        "GET /api/patients/:id/documents/:docId": {
          description: "Download document",
          authentication: "JWT",
        },
      },
      
      soapNotes: {
        "GET /api/soap-notes": {
          description: "Get SOAP notes for patient",
          authentication: "JWT (provider)",
          parameters: ["patientId", "includeRevisions", "approvedOnly"],
        },
        "POST /api/soap-notes": {
          description: "Create SOAP note (manual or AI-generated)",
          authentication: "JWT (provider)",
        },
      },
      
      prescriptions: {
        "POST /api/prescriptions": {
          description: "Create prescription via Lifefile",
          authentication: "JWT (provider)",
        },
        "GET /api/prescriptions/:id": {
          description: "Get prescription status",
          authentication: "JWT",
        },
      },
      
      billing: {
        "GET /api/stripe/invoices": {
          description: "List patient invoices",
          authentication: "JWT",
        },
        "POST /api/stripe/create-checkout": {
          description: "Create Stripe checkout session",
          authentication: "JWT",
        },
      },
    },
    
    rateLimits: {
      authentication: { limit: 5, window: "15 minutes" },
      standardApi: { limit: 120, window: "1 minute" },
      webhooks: { limit: 1000, window: "1 minute" },
      fileUpload: { limit: 10, window: "1 minute" },
    },
    
    webhookPayloadFormats: [
      {
        name: "data_object",
        description: "Recommended format with data nested in 'data' object",
        example: {
          submissionId: "unique-id",
          data: { firstName: "John", lastName: "Doe" },
        },
      },
      {
        name: "answers_array",
        description: "Array of answers with id, label, value",
        example: {
          submissionId: "unique-id",
          answers: [{ id: "firstName", label: "First Name", value: "John" }],
        },
      },
      {
        name: "sections_array",
        description: "HeyFlow-style sections with fields",
        example: {
          submissionId: "unique-id",
          sections: [{ title: "Info", fields: [{ id: "firstName", value: "John" }] }],
        },
      },
      {
        name: "medlink_v2",
        description: "MedLink format with responseId and field IDs",
        example: {
          responseId: "unique-id",
          "id-b1679347": "John",
        },
      },
    ],
    
    fieldMappings: {
      firstName: ["firstName", "first_name", "fname"],
      lastName: ["lastName", "last_name", "lname"],
      email: ["email", "email_address", "emailAddress"],
      phone: ["phone", "phone_number", "phoneNumber", "mobile", "cell"],
      dateOfBirth: ["dateOfBirth", "date_of_birth", "dob", "birthDate", "birthday"],
      state: ["state", "stateCode", "state_code", "province"],
    },
    
    quickStart: {
      step1: "Contact support@eonpro.io to get your webhook secret",
      step2: "Configure your platform to send POST requests to /api/webhooks/weightlossintake",
      step3: "Include x-webhook-secret header with your secret",
      step4: "Test with /api/webhooks/test endpoint first",
      step5: "Check /api/admin/webhook-status for delivery logs",
    },
  }, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
