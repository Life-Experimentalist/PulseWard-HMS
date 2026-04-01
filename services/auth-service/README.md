# PulseWard HMS - Auth Service

## Overview

The **Auth Service** is a critical component of the PulseWard Hospital Management System (HMS). It is responsible for managing user authentication and authorization across the various applications within the system. This service ensures that only authorized users can access sensitive information and perform actions based on their roles.

## Features

- **User Registration**: Allows new users to create accounts.
- **User Login**: Authenticates users and provides access tokens.
- **Role Management**: Assigns roles to users (e.g., patient, clinician, admin) to control access levels.
- **Token Management**: Issues and validates JWT tokens for secure communication.
- **Password Management**: Handles password hashing, reset, and recovery processes.

## Architecture

The Auth Service follows a microservices architecture, allowing it to scale independently and integrate seamlessly with other services in the PulseWard HMS. It communicates with the API Gateway for routing requests and utilizes a database for storing user credentials and roles.

## API Documentation

The API endpoints for the Auth Service are defined in the `openapi.yaml` file located in the `src` directory. This documentation provides details on request and response formats, authentication methods, and error handling.

## Development

### Prerequisites

- Node.js (version 14.x or higher)
- MongoDB (for user data storage)
- Docker (for containerization)

### Setup

1. Clone the repository:

   ```
   git clone https://github.com/Life-Experimentalist/PulseWard-HMS.git
   cd PulseWard-HMS/services/auth-service
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Start the service:
   ```
   npm start
   ```

### Testing

To run the tests for the Auth Service, navigate to the `tests` directory and execute:

```
npm test
```

## Integration with AI Project Manager Agent

The Auth Service is designed to work in conjunction with the AI Project Manager Agent, which assists in managing project tasks, tracking progress, and ensuring adherence to project timelines. The integration allows for automated updates and notifications regarding user management activities.

## Conclusion

The Auth Service is a vital part of the PulseWard HMS, ensuring secure access to the system's functionalities. Its modular design allows for easy updates and scalability, making it a robust solution for hospital management needs.
