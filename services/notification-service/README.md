# PulseWard Notification Service

## Overview

The Notification Service is a crucial component of the PulseWard Hospital Management System (HMS). It is responsible for managing notifications sent to patients and staff, ensuring timely communication regarding appointments, test results, and other important updates.

## Features

- **Real-time Notifications**: Sends notifications in real-time to patients and staff.
- **Multi-channel Support**: Supports various notification channels such as email, SMS, and in-app notifications.
- **Customizable Templates**: Allows for customizable notification templates to suit different types of messages.
- **Delivery Tracking**: Tracks the status of notifications to ensure they are delivered successfully.

## Architecture

The Notification Service is designed as a microservice, allowing it to scale independently and integrate seamlessly with other services in the PulseWard HMS. It communicates with the API Gateway for routing requests and utilizes a message broker for handling asynchronous notifications.

## API Endpoints

The Notification Service exposes the following API endpoints:

- **POST /notifications**: Create a new notification.
- **GET /notifications/{id}**: Retrieve a notification by ID.
- **GET /notifications**: List all notifications.
- **PUT /notifications/{id}**: Update a notification by ID.
- **DELETE /notifications/{id}**: Delete a notification by ID.

## Development

### Prerequisites

- Node.js (version 14.x or higher)
- MongoDB (for storing notification data)
- Message Broker (e.g., RabbitMQ or Kafka)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/Life-Experimentalist/PulseWard-HMS.git
   ```
2. Navigate to the notification service directory:
   ```
   cd PulseWard-HMS/services/notification-service
   ```
3. Install dependencies:
   ```
   npm install
   ```

### Running the Service

To start the Notification Service, run:

```
npm start
```

### Testing

To run the tests for the Notification Service, use:

```
npm test
```

## Documentation

For detailed API documentation, refer to the `openapi.yaml` file located in the `notification-service` directory.

## Contribution

Contributions are welcome! Please follow the standard pull request process and ensure that all tests pass before submitting.

## License

This project is proprietary and confidential. All rights reserved. See the LICENSE.md file for internal licensing terms.
