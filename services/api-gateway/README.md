# PulseWard API Gateway

Welcome to the PulseWard API Gateway documentation! This document provides an overview of the API Gateway service, its purpose, and how to interact with it.

## Project Overview

The **PulseWard API Gateway** acts as a single entry point for all client requests to the various microservices within the PulseWard Hospital Management System. It is responsible for routing requests, aggregating responses, and ensuring secure communication between clients and services.

## Key Features

- **Request Routing**: Directs incoming requests to the appropriate backend services based on the request path and method.
- **Response Aggregation**: Combines responses from multiple services into a single response for the client.
- **Authentication and Authorization**: Integrates with the authentication service to ensure that only authorized users can access certain endpoints.
- **Rate Limiting**: Implements rate limiting to prevent abuse and ensure fair usage of the API.
- **Logging and Monitoring**: Provides logging capabilities for tracking requests and responses, which aids in monitoring and debugging.

## API Endpoints

The API Gateway exposes various endpoints that correspond to the functionalities of the underlying services. For detailed information about each endpoint, please refer to the OpenAPI specification located in `openapi.yaml`.

## Development

### Getting Started

To set up the API Gateway service locally, follow these steps:

1. Clone the repository:

   ```
   git clone https://github.com/Life-Experimentalist/PulseWard-HMS.git
   cd PulseWard-HMS/services/api-gateway
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

To run the tests for the API Gateway, navigate to the `tests` directory and execute:

```
npm test
```

## Documentation

For comprehensive documentation on the architecture, development model, and API specifications, please refer to the `docs` directory in the main project.

## Contribution

Contributions to the PulseWard API Gateway are welcome! Please follow the project's contribution guidelines outlined in the main repository.

## License

This project is proprietary and confidential. All rights reserved. See the LICENSE.md file for internal licensing terms.

---

Thank you for using the PulseWard API Gateway! If you have any questions or need further assistance, please reach out to the development team.
