/**
 * OpenAPI/Swagger Specification for EONPRO API
 * @version 2.0.0
 */

export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'EONPRO Healthcare Platform API',
    version: '2.0.0',
    description: `
# EONPRO API Documentation

Enterprise healthcare platform API for managing patients, providers, prescriptions, 
billing, and telehealth services.

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:

\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

## Rate Limiting

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Authentication | 5 requests | 15 minutes |
| Standard API | 120 requests | 1 minute |
| File Upload | 10 requests | 1 minute |
| External API | 1000 requests | 1 minute |

Rate limit headers are included in all responses:
- \`X-RateLimit-Limit\`: Maximum requests per window
- \`X-RateLimit-Remaining\`: Remaining requests
- \`X-RateLimit-Reset\`: Window reset time (ISO 8601)

## Error Responses

All errors follow this format:

\`\`\`json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "requestId": "unique-request-id"
}
\`\`\`
    `,
    contact: {
      name: 'EONPRO Support',
      email: 'support@eonpro.io',
      url: 'https://eonpro.io/support',
    },
    license: {
      name: 'Proprietary',
      url: 'https://eonpro.io/terms',
    },
  },
  servers: [
    {
      url: 'https://app.eonpro.io/api',
      description: 'Production',
    },
    {
      url: 'https://staging.eonpro.io/api',
      description: 'Staging',
    },
    {
      url: 'http://localhost:3001/api',
      description: 'Development',
    },
  ],
  tags: [
    { name: 'Authentication', description: 'User authentication and session management' },
    { name: 'Patients', description: 'Patient record management' },
    { name: 'Providers', description: 'Healthcare provider management' },
    { name: 'Orders', description: 'Prescription order management' },
    { name: 'Billing', description: 'Invoices, payments, and subscriptions' },
    { name: 'Appointments', description: 'Scheduling and availability' },
    { name: 'Documents', description: 'Patient document management' },
    { name: 'Chat', description: 'SMS and chat messaging' },
    { name: 'Admin', description: 'Administrative operations' },
  ],
  paths: {
    // Authentication
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'User login',
        description: 'Authenticate user with email and password',
        operationId: 'login',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  rememberMe: { type: 'boolean', default: false },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/auth/verify-otp': {
      post: {
        tags: ['Authentication'],
        summary: 'Verify OTP',
        description: 'Verify one-time password for two-factor authentication',
        operationId: 'verifyOtp',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code', 'sessionId'],
                properties: {
                  code: { type: 'string', pattern: '^[0-9]{6}$' },
                  sessionId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'OTP verified successfully',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuthResponse' },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    // Patients
    '/patients': {
      get: {
        tags: ['Patients'],
        summary: 'List patients',
        description: 'Get paginated list of patients',
        operationId: 'listPatients',
        security: [{ bearerAuth: [] }],
        parameters: [
          { $ref: '#/components/parameters/PageParam' },
          { $ref: '#/components/parameters/LimitParam' },
          { $ref: '#/components/parameters/SearchParam' },
        ],
        responses: {
          '200': {
            description: 'Patients list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    patients: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Patient' },
                    },
                    total: { type: 'integer' },
                    page: { type: 'integer' },
                    limit: { type: 'integer' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Patients'],
        summary: 'Create patient',
        description: 'Create a new patient record',
        operationId: 'createPatient',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PatientCreate' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Patient created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Patient' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/patients/{id}': {
      get: {
        tags: ['Patients'],
        summary: 'Get patient',
        description: 'Get patient by ID',
        operationId: 'getPatient',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/PatientIdParam' }],
        responses: {
          '200': {
            description: 'Patient details',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Patient' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      patch: {
        tags: ['Patients'],
        summary: 'Update patient',
        description: 'Update patient record',
        operationId: 'updatePatient',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/PatientIdParam' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PatientUpdate' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Patient updated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Patient' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    // Invoices
    '/stripe/invoices': {
      get: {
        tags: ['Billing'],
        summary: 'List invoices',
        description: 'Get invoices for a patient',
        operationId: 'listInvoices',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'patientId',
            in: 'query',
            required: true,
            schema: { type: 'integer' },
          },
        ],
        responses: {
          '200': {
            description: 'Invoices list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    invoices: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Invoice' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Billing'],
        summary: 'Create invoice',
        description: 'Create a new invoice',
        operationId: 'createInvoice',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/InvoiceCreate' },
            },
          },
        },
        responses: {
          '201': {
            description: 'Invoice created',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Invoice' },
              },
            },
          },
        },
      },
    },
    // Appointments
    '/scheduling/appointments': {
      get: {
        tags: ['Appointments'],
        summary: 'List appointments',
        description: 'Get appointments with filters',
        operationId: 'listAppointments',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'providerId',
            in: 'query',
            schema: { type: 'integer' },
          },
          {
            name: 'patientId',
            in: 'query',
            schema: { type: 'integer' },
          },
          {
            name: 'startDate',
            in: 'query',
            schema: { type: 'string', format: 'date' },
          },
          {
            name: 'endDate',
            in: 'query',
            schema: { type: 'string', format: 'date' },
          },
        ],
        responses: {
          '200': {
            description: 'Appointments list',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Appointment' },
                },
              },
            },
          },
        },
      },
    },
    // Chat/SMS
    '/twilio/messages/{patientId}': {
      get: {
        tags: ['Chat'],
        summary: 'Get message history',
        description: 'Get SMS message history for a patient',
        operationId: 'getMessages',
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: '#/components/parameters/PatientIdParam' }],
        responses: {
          '200': {
            description: 'Message history',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    messages: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Message' },
                    },
                    source: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/twilio/send': {
      post: {
        tags: ['Chat'],
        summary: 'Send SMS',
        description: 'Send SMS message to a patient',
        operationId: 'sendSms',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['to', 'message', 'patientId'],
                properties: {
                  to: { type: 'string', description: 'Phone number' },
                  message: { type: 'string', maxLength: 1600 },
                  patientId: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Message sent',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    messageSid: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from /auth/login',
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for external integrations',
      },
    },
    schemas: {
      AuthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          token: { type: 'string' },
          user: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              email: { type: 'string' },
              role: { type: 'string' },
              clinicId: { type: 'integer' },
            },
          },
        },
      },
      Patient: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          dob: { type: 'string', format: 'date' },
          gender: { type: 'string', enum: ['male', 'female', 'other'] },
          address1: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          zip: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          source: { type: 'string' },
        },
      },
      PatientCreate: {
        type: 'object',
        required: ['firstName', 'lastName', 'email', 'phone', 'dob', 'gender'],
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          dob: { type: 'string', format: 'date' },
          gender: { type: 'string' },
          address1: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          zip: { type: 'string' },
        },
      },
      PatientUpdate: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          address1: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          zip: { type: 'string' },
        },
      },
      Invoice: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          stripeInvoiceId: { type: 'string' },
          stripeInvoiceNumber: { type: 'string' },
          status: { type: 'string', enum: ['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE'] },
          amountDue: { type: 'number' },
          amountPaid: { type: 'number' },
          dueDate: { type: 'string', format: 'date' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      InvoiceCreate: {
        type: 'object',
        required: ['patientId', 'items'],
        properties: {
          patientId: { type: 'integer' },
          description: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                amount: { type: 'number' },
                quantity: { type: 'integer', default: 1 },
              },
            },
          },
          dueDate: { type: 'string', format: 'date' },
        },
      },
      Appointment: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          patientId: { type: 'integer' },
          providerId: { type: 'integer' },
          scheduledAt: { type: 'string', format: 'date-time' },
          duration: { type: 'integer', description: 'Duration in minutes' },
          type: { type: 'string', enum: ['in-person', 'telehealth', 'phone'] },
          status: {
            type: 'string',
            enum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'no-show'],
          },
          notes: { type: 'string' },
        },
      },
      Message: {
        type: 'object',
        properties: {
          sid: { type: 'string' },
          body: { type: 'string' },
          direction: { type: 'string', enum: ['inbound', 'outbound-api'] },
          status: { type: 'string' },
          dateCreated: { type: 'string', format: 'date-time' },
          from: { type: 'string' },
          to: { type: 'string' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: { type: 'string' },
          requestId: { type: 'string' },
        },
      },
    },
    parameters: {
      PatientIdParam: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Patient ID',
        schema: { type: 'integer' },
      },
      PageParam: {
        name: 'page',
        in: 'query',
        description: 'Page number (1-indexed)',
        schema: { type: 'integer', default: 1, minimum: 1 },
      },
      LimitParam: {
        name: 'limit',
        in: 'query',
        description: 'Items per page',
        schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
      },
      SearchParam: {
        name: 'search',
        in: 'query',
        description: 'Search query',
        schema: { type: 'string' },
      },
    },
    responses: {
      BadRequest: {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      Unauthorized: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      Forbidden: {
        description: 'Forbidden',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      NotFound: {
        description: 'Not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      RateLimited: {
        description: 'Rate limit exceeded',
        headers: {
          'X-RateLimit-Limit': {
            schema: { type: 'integer' },
            description: 'Request limit per window',
          },
          'X-RateLimit-Remaining': {
            schema: { type: 'integer' },
            description: 'Remaining requests',
          },
          'X-RateLimit-Reset': {
            schema: { type: 'string', format: 'date-time' },
            description: 'Window reset time',
          },
          'Retry-After': {
            schema: { type: 'integer' },
            description: 'Seconds until retry',
          },
        },
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
    },
  },
};

export default openApiSpec;
