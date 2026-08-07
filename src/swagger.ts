export const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "Bank J-NAL API",
    version: "1.0.0",
    description: "API Documentation for Bank J-NAL backend."
  },
  servers: [
    {
      url: "http://localhost:3001/api/v1",
      description: "Local Development Server"
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    }
  },
  security: [
    { bearerAuth: [] }
  ],
  paths: {
    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  phone: { type: "string", example: "081234567890" },
                  password: { type: "string", example: "password-demo" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Successful login" }
        }
      }
    },
    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh Token",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  refreshToken: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Token refreshed" }
        }
      }
    },
    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Logout",
        responses: {
          "204": { description: "Logged out successfully" }
        }
      }
    },
    "/me": {
      get: {
        tags: ["Me"],
        summary: "Get current user profile",
        responses: {
          "200": { description: "Profile data" }
        }
      },
      patch: {
        tags: ["Me"],
        summary: "Update profile",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Updated profile data" }
        }
      }
    },
    "/me/security/pin": {
      put: {
        tags: ["Me"],
        summary: "Update PIN",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  oldPin: { type: "string" },
                  newPin: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "PIN updated" }
        }
      }
    },
    "/pockets": {
      get: {
        tags: ["Pockets"],
        summary: "Get user pockets",
        responses: {
          "200": { description: "List of pockets" }
        }
      },
      post: {
        tags: ["Pockets"],
        summary: "Create a new pocket",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  targetAmount: { type: "number" }
                }
              }
            }
          }
        },
        responses: {
          "201": { description: "Pocket created" }
        }
      }
    },
    "/cards": {
      get: {
        tags: ["Cards"],
        summary: "Get user cards",
        responses: {
          "200": { description: "List of cards" }
        }
      }
    },
    "/qris/resolve": {
      post: {
        tags: ["QRIS"],
        summary: "Resolve QRIS data",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  qrCodeData: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "QRIS resolved payload" }
        }
      }
    },
    "/qris/payments": {
      post: {
        tags: ["QRIS"],
        summary: "Pay via QRIS",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  merchantId: { type: "string" },
                  amount: { type: "number" },
                  pin: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          "200": { description: "Payment successful" }
        }
      }
    }
  }
};
