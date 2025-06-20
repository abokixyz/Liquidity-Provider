import swaggerJsdoc from 'swagger-jsdoc';
import { SwaggerDefinition } from 'swagger-jsdoc';

const swaggerDefinition: SwaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'ABOKI Authentication API',
    version: '1.0.0',
    description: `
      A comprehensive authentication system built with Node.js, TypeScript, and MongoDB.
      
      ## Features
      - User registration with email verification
      - JWT-based authentication
      - Password reset functionality
      - User profile management
      - Email notifications via Brevo
      - Rate limiting and security features
      
      ## Authentication
      Most endpoints require a JWT token. Include it in the Authorization header:
      \`Authorization: Bearer <your-jwt-token>\`
      
      ## Rate Limiting
      - General API: 100 requests per 15 minutes
      - Auth endpoints: 10 requests per 15 minutes
    `,
    contact: {
      name: 'ABOKI Support',
      email: 'hello@aboki.xyz',
      url: 'https://aboki.xyz'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: 'http://localhost:5001',
      description: 'Development server'
    },
    {
      url: 'https://liquidity-provider.onrender.com',
      description: 'Production server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'User ID',
            example: '507f1f77bcf86cd799439011'
          },
          name: {
            type: 'string',
            description: 'User full name',
            example: 'John Doe'
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address',
            example: 'john.doe@example.com'
          },
          isEmailVerified: {
            type: 'boolean',
            description: 'Email verification status',
            example: true
          },
          createdAt: {
            type: 'string',
            format: 'date-time',
            description: 'Account creation timestamp'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time',
            description: 'Last update timestamp'
          }
        }
      },
      AuthResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          token: {
            type: 'string',
            description: 'JWT authentication token',
            example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
          },
          user: {
            $ref: '#/components/schemas/User'
          }
        }
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          message: {
            type: 'string',
            example: 'Operation completed successfully'
          }
        }
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false
          },
          message: {
            type: 'string',
            example: 'Error message'
          },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: {
                  type: 'string'
                },
                message: {
                  type: 'string'
                }
              }
            }
          }
        }
      },
      ValidationError: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false
          },
          message: {
            type: 'string',
            example: 'Validation failed'
          },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  example: 'field'
                },
                value: {
                  type: 'string',
                  example: 'invalid-email'
                },
                msg: {
                  type: 'string',
                  example: 'Please provide a valid email'
                },
                path: {
                  type: 'string',
                  example: 'email'
                },
                location: {
                  type: 'string',
                  example: 'body'
                }
              }
            }
          }
        }
      }
    }
  },
  tags: [
    {
      name: 'Authentication',
      description: 'User authentication endpoints'
    },
    {
      name: 'User Management',
      description: 'User profile and account management'
    },
    {
      name: 'Email Verification',
      description: 'Email verification and password reset'
    },
    {
      name: 'System',
      description: 'System health and information'
    }
  ]
};

const options = {
  definition: swaggerDefinition,
  apis: ['./src/routes/*.ts', './src/controllers/*.ts', './src/server.ts'], // Path to the API files
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;